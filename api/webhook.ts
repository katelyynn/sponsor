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
            const payload_text = await req.text();

            const sig = req.headers.get('X-Hub-Signature-256');
            const valid = webhooks.verify(payload_text, sig!);

            if (!valid) {
                return new Response('Invalid Signature', { status: 401 });
            }

            const payload = JSON.parse(payload_text);

            const event = req.headers.get('X-GitHub-Event');
            if (event != 'sponsorship' && event != 'ping') {
                return new Response(`Ignored event ${event}`, { status: 200 });
            }

            const { action, sponsorship } = payload;

            console.log('Sponsorship payload:', payload);

            if (!action || !sponsorship) {
                const discord_res = await fetch(process.env.DISCORD_WEBHOOK_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        content: 'test'
                    })
                });

                if (!discord_res.ok) {
                    console.error(`Failed to send webhook: ${discord_res.status} - ${discord_res.statusText}`);
                    return new Response(`Failed sending to Discord`, { status: 502 });
                }

                return new Response(`Webhook sent successfully`, { status: 200 });
            }

            const login = sponsorship?.sponsor?.login || '';
            const dollars = sponsorship?.tier?.monthly_price_in_dollars || 0;
            const sponsor_tier = sponsorship?.tier?.name || '';
            const avatar = sponsorship?.sponsor?.avatar_url || '';

            let text = '';

            switch (action) {
                case 'created':
                    text = `*${login}** sponsored ${sponsor_tier}`;
                    break;
                case 'cancelled':
                    text = `*${login}* cancelled ${sponsor_tier}`;
                    break;
                case 'edited':
                    text = `*${login}* changed to ${sponsor_tier}`;
                    break;
                case 'pending_cancellation':
                    text = `*${login}* scheduled cancelling ${sponsor_tier}`;
                    break;
                case 'pending_tier_change':
                    text = `*${login}* scheduled changing to ${sponsor_tier}`;
                    break;
                case 'tier_changed':
                    text = `*${login}* changed to ${sponsor_tier}`;
                    break;
                default:
                    text = `*${login}* unknown`;
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
                            "url": avatar
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

            const discord_res = await fetch(`${process.env.DISCORD_WEBHOOK_URL}?with_components=true`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    flags: 32768,
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
