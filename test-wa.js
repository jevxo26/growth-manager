const { Client, LocalAuth } = require("whatsapp-web.js");

const client = new Client({
    authStrategy: new LocalAuth({ clientId: "default" }),
    puppeteer: { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] }
});

client.on("ready", async () => {
    console.log("READY");
    try {
        const isRegistered = await client.isRegisteredUser("8801522123568@c.us");
        console.log("Is Registered:", isRegistered);
        const res = await client.sendMessage("8801522123568@c.us", "test");
        console.log("Sent:", res.id._serialized);
    } catch(e) {
        console.error("Error sending:", e.message);
    }
    process.exit(0);
});

client.on("qr", (qr) => console.log("QR RECEIVED"));
client.initialize();
