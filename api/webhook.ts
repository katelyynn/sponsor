import { Webhooks } from "@octokit/webhooks";

const webhooks = new Webhooks({
    secret: process.env.WEBHOOK_SECRET || '',
});

export default {
    async fetch(req: Request) {
        if (req.method != 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        try {
            const payload = await req.json();
            const payload_text = await req.text();

            const sig = req.headers.get('X-Hub-Signature');
            const valid = webhooks.verify(payload_text, sig!);

            if (!valid) {
                return new Response('Invalid Signature', { status: 401 });
            }

            const event = req.headers.get('X-GitHub-Event');
            if (event != 'sponsorship') {
                return new Response(`Ignored event ${event}`, { status: 200 });
            }

            const { action, sponsorship } = payload;

            let text = '';

            switch (action) {
                case 'created':
                    text = `*${sponsorship.sponsor.login}** sponsored for $${sponsorship.tier.monthly_price_in_dollars}`;
                    break;
                case 'cancelled':
                    text = `*${sponsorship.sponsor.login}* cancelled their $${sponsorship.tier.monthly_price_in_dollars} sponsorship`;
                    break;
                case 'edited':
                    text = `*${sponsorship.sponsor.login}* edited their $${sponsorship.tier.monthly_price_in_dollars} sponsorship`;
                    break;
                case 'pending_cancellation':
                    text = `*${sponsorship.sponsor.login}* scheduled cancelling their $${sponsorship.tier.monthly_price_in_dollars} sponsorship`;
                    break;
                case 'pending_tier_change':
                    text = `*${sponsorship.sponsor.login}* scheduled changing sponsor tier to $${sponsorship.tier.monthly_price_in_dollars}`;
                    break;
                case 'tier_changed':
                    text = `*${sponsorship.sponsor.login}* changed sponsor tier to $${sponsorship.tier.monthly_price_in_dollars}`;
                    break;
                default:
                    text = `*${sponsorship.sponsor.login}* unknown`;
                    break;
            }

            const components = [
                {
                    "type": 9,
                    "components": [
                        {
                            "type": 10,
                            "content": `### ${text}`
                        }
                    ],
                    "accessory": {
                        "type": 11,
                        "media": {
                            "url": sponsorship.sponsor.avatar_url
                        },
                        "description": "avatar"
                    }
                },
                {
                    "type": 1,
                    "components": [
                        {
                            "type": 2,
                            "style": 5,
                            "url": sponsorship.sponsor.html_url,
                            "label": "view profile"
                        }
                    ]
                }
            ];

            const discord_res = await fetch(process.env.DISCORD_WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    components: components
                })
            });

            if (!discord_res.ok) {
                console.error(`Failed to send webhook: ${discord_res.status} - ${discord_res.statusText}`);
                return new Response(`Failed sending to Discord`, { status: 502 });
            }

            return new Response(`Webhook sent successfully`, { status: 200 });
        } catch (e) {
            console.error(e);

            if (e.message && e.message.includes('signature')) {
                return new Response('Invalid signature', { status: 401 });
            }

            return new Response('Internal Server Error', { status: 500 });
        }
    }
}
