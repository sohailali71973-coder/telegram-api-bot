import { Telegraf, Markup } from 'telegraf';

const API_KEY = "MY_TEST_KEY_123";

export default {
    async fetch(request, env, ctx) {
        if (request.method !== "POST") {
            return new Response("Bot is running perfectly on Cloudflare Workers!");
        }

        const bot = new Telegraf(env.BOT_TOKEN);
        const db = env.DB;

        // --- Helper Database Functions ---
        async function getUser(userId) {
            return await db.prepare("SELECT * FROM users WHERE user_id = ?").bind(userId).first();
        }

        async function createIfNotExists(user, refId) {
            const existing = await getUser(user.id);
            if (!existing) {
                await db.prepare("INSERT INTO users (user_id, username, credits, referred_by) VALUES (?, ?, 3, ?)")
                    .bind(user.id, user.username || "", refId || null).run();
            }
        }

        async function addCredits(userId, amount) {
            await db.prepare("UPDATE users SET credits = credits + ? WHERE user_id = ?").bind(amount, userId).run();
        }

        async function deductCredit(userId) {
            const u = await getUser(userId);
            if (!u || u.credits < 1) return false;
            await db.prepare("UPDATE users SET credits = credits - 1 WHERE user_id = ?").bind(userId).run();
            return true;
        }

        // --- Keyboards ---
        const mainKeyboard = Markup.inlineKeyboard([
            [Markup.button.callback("🔍 API Check", "api_menu")],
            [Markup.button.callback("💰 My Credits", "credits"), Markup.button.callback("👥 Refer & Earn", "refer")],
            [Markup.button.callback("🎁 Daily Claim", "daily"), Markup.button.callback("🎰 Spin & Win", "spin")],
            [Markup.button.callback("🎟 Redeem Claim", "redeem")]
        ]);

        const apiKeyboard = Markup.inlineKeyboard([
            [Markup.button.callback("🚗 Vehicle Search", "vehicle")],
            [Markup.button.callback("📍 Pincode Search", "pincode")],
            [Markup.button.callback("📱 Mobile Search", "api3"), Markup.button.callback("🆔 ID Search", "api4")],
            [Markup.button.callback("💳 UPI Search", "api5")],
            [Markup.button.callback("🔙 Back", "back")]
        ]);

        // --- Command Handlers ---
        bot.start(async (ctx) => {
            const textParts = ctx.message.text.split(" ");
            let refId = textParts.length > 1 ? parseInt(textParts[1]) : null;
            if (refId === ctx.from.id) refId = null;

            await createIfNotExists(ctx.from, refId);
            return ctx.replyWithHTML(
                "⚡ <b>WELCOME TO API BOT</b> ⚡\n\nAccess lene ke liye Instagram follow karein:\n📸 @Clip2editz\n\n" +
                "Click Verify to start!",
                Markup.inlineKeyboard([
                    [Markup.button.url("📸 Follow Instagram", "https://www.instagram.com/Clip2editz/")],
                    [Markup.button.callback("✅ Verify & Continue", "verify")]
                ])
            );
        });

        // --- Callback Handlers ---
        bot.action("verify", async (ctx) => {
            const user = ctx.from;
            const uData = await getUser(user.id);
            
            await db.prepare("UPDATE users SET verified = 1 WHERE user_id = ?").bind(user.id).run();

            if (uData && uData.referred_by && uData.referral_rewarded === 0 && uData.referred_by !== user.id) {
                await addCredits(uData.referred_by, 3);
                await db.prepare("UPDATE users SET referral_rewarded = 1 WHERE user_id = ?").bind(user.id).run();
            }

            await ctx.answerCbQuery();
            return ctx.editMessageText("✅ <b>Verification Successful!</b>\n\nWelcome! Ab options access kar sakte ho.", {
                parse_mode: "HTML",
                ...mainKeyboard
            });
        });

        bot.action("back", async (ctx) => {
            const u = await getUser(ctx.from.id);
            await ctx.answerCbQuery();
            return ctx.editMessageText(`🏠 <b>MAIN MENU</b>\n\n💰 Available Credits: <b>${u ? u.credits : 0}</b>`, {
                parse_mode: "HTML",
                ...mainKeyboard
            });
        });

        bot.action("api_menu", async (ctx) => {
            await ctx.answerCbQuery();
            return ctx.editMessageText("🔍 <b>API CHECK</b>\n\nOption select karo. Successful search = 1 Credit.", {
                parse_mode: "HTML",
                ...apiKeyboard
            });
        });

        bot.action("credits", async (ctx) => {
            const u = await getUser(ctx.from.id);
            return ctx.answerCbQuery(`💰 Tumhare paas ${u ? u.credits : 0} Credits hain!`, { show_alert: true });
        });

        bot.action("daily", async (ctx) => {
            const u = await getUser(ctx.from.id);
            const now = new Date();

            if (u && u.daily_time) {
                const last = new Date(u.daily_time);
                const diffHours = (now - last) / (1000 * 60 * 60);
                if (diffHours < 24) {
                    const waitMins = Math.ceil((24 - diffHours) * 60);
                    return ctx.answerCbQuery(`⏳ Already claimed! Wait ${Math.floor(waitMins/60)}h ${waitMins%60}m`, { show_alert: true });
                }
            }

            await addCredits(ctx.from.id, 1);
            await db.prepare("UPDATE users SET daily_time = ? WHERE user_id = ?").bind(now.toISOString(), ctx.from.id).run();
            return ctx.answerCbQuery("🎉 Daily Claim Successful! +1 Credit", { show_alert: true });
        });

        bot.action("spin", async (ctx) => {
            const u = await getUser(ctx.from.id);
            const now = new Date();

            if (u && u.spin_time) {
                const last = new Date(u.spin_time);
                const diffHours = (now - last) / (1000 * 60 * 60);
                if (diffHours < 24) {
                    const waitMins = Math.ceil((24 - diffHours) * 60);
                    return ctx.answerCbQuery(`⏳ Spin used! Wait ${Math.floor(waitMins/60)}h ${waitMins%60}m`, { show_alert: true });
                }
            }

            const win = Math.floor(Math.random() * 5) + 1;
            await addCredits(ctx.from.id, win);
            await db.prepare("UPDATE users SET spin_time = ? WHERE user_id = ?").bind(now.toISOString(), ctx.from.id).run();
            return ctx.answerCbQuery(`🎰 SPIN RESULT!\n\n🎉 You won +${win} Credits!`, { show_alert: true });
        });

        // --- API Action Steps ---
        const prompts = {
            vehicle: "🚗 <b>VEHICLE SEARCH</b>\n\nNumber bhejo (e.g., RJ14CV0002)",
            pincode: "📍 <b>PINCODE SEARCH</b>\n\nPincode bhejo (e.g., 411001)",
            api3: "📱 <b>MOBILE SEARCH</b>\n\nMobile Number bhejo (e.g., 9876543210)",
            api4: "🆔 <b>ID SEARCH</b>\n\n12-Digit Number bhejo (e.g., [Aadhaar Number Redacted])",
            api5: "💳 <b>UPI SEARCH</b>\n\nUPI ID bhejo (e.g., example@ybl)"
        };

        Object.keys(prompts).forEach(key => {
            bot.action(key, async (ctx) => {
                ctx.session = ctx.session || {};
                ctx.session.waitingFor = key;
                await ctx.answerCbQuery();
                return ctx.editMessageText(prompts[key], {
                    parse_mode: "HTML",
                    ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Back", "api_menu")]])
                });
            });
        });

        // --- Text/Search Handler ---
        bot.on("text", async (ctx) => {
            const input = ctx.message.text.trim();
            const u = await getUser(ctx.from.id);

            if (!u || u.credits < 1) {
                return ctx.reply("❌ Credits nahi hain!");
            }

            let url = "";
            let title = "";

            if (input.match(/^\d{10}$/)) {
                url = `https://nitin-developer-api-paid.nitinshab43.workers.dev/api?action=num&key=${API_KEY}&number=${input}`;
                title = "MOBILE SEARCH";
            } else if (input.match(/^\d{12}$/)) {
                url = `https://nitin-developer-api-paid.nitinshab43.workers.dev/api?action=aadhar&key=${API_KEY}&aadhar=${encodeURIComponent(input)}`;
                title = "ID SEARCH";
            } else if (input.includes("@")) {
                url = `https://nitin-developer-api-paid.nitinshab43.workers.dev/api?action=upiinfo&key=${API_KEY}&upi=${encodeURIComponent(input)}`;
                title = "UPI SEARCH";
            } else if (input.length === 6 && !isNaN(input)) {
                url = `https://nitin-api-free-user-1k-spacial.vercel.app/api?type=pincode&search=${input}`;
                title = "PINCODE SEARCH";
            } else {
                url = `https://nitin-api-free-user-1k-spacial.vercel.app/api?type=vehicle&search=${input}`;
                title = "VEHICLE SEARCH";
            }

            try {
                const res = await fetch(url);
                const data = await res.json();
                
                await deductCredit(ctx.from.id);
                const updated = await getUser(ctx.from.id);

                return ctx.replyWithHTML(
                    `🔎 <b>${title} RESULT</b>\n\n<pre>${JSON.stringify(data, null, 2)}</pre>\n\n` +
                    `💰 Remaining Credits: <b>${updated.credits}</b>\n\n` +
                    `〆 <b>DEVELOPER : SOHAIL</b>`
                );
            } catch (err) {
                return ctx.reply("❌ API request failed!");
            }
        });

        // Process Update
        const body = await request.json();
        await bot.handleUpdate(body);
        return new Response("OK");
    }
};
