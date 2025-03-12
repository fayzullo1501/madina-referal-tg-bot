require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const mongoose = require("mongoose");

// Подключение к MongoDB Atlas
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Подключение к MongoDB успешно!"))
  .catch((err) => console.error("❌ Ошибка подключения к MongoDB:", err));

// Создаём схему для хранения пользователей
const userSchema = new mongoose.Schema({
  telegramId: { type: Number, unique: true },
  username: String,
  referredBy: Number, // ID пригласившего пользователя
  referrals: { type: Number, default: 0 },
});

const User = mongoose.model("User", userSchema);

const bot = new Telegraf(process.env.BOT_TOKEN);
const CHANNEL_ID = process.env.CHANNEL_ID.replace("@", ""); // Убираем @ из CHANNEL_ID

// 🔥 Добавляем массив админов
const ADMIN_IDS = process.env.ADMIN_IDS.split(",").map(id => parseInt(id.trim(), 10));

// Функция проверки, является ли пользователь админом
function isAdmin(userId) {
  return ADMIN_IDS.includes(userId);
}

// Проверка подписки на канал
async function isUserSubscribed(userId) {
  try {
    const chatMember = await bot.telegram.getChatMember(`@${CHANNEL_ID}`, userId);
    return ["member", "administrator", "creator"].includes(chatMember.status);
  } catch (error) {
    return false;
  }
}

// 🔥 Генерация уникальной реферальной ссылки
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username || "unknown";
  const referralId = ctx.message.text.split(" ")[1];

  let user = await User.findOne({ telegramId: userId });

  if (!user) {
    user = new User({ telegramId: userId, username, referredBy: referralId });
    await user.save();

    if (referralId) {
      const referrer = await User.findOne({ telegramId: referralId });
      if (referrer) {
        referrer.referrals += 1;
        await referrer.save();
      }
    }
  }

  // Уникальная реферальная ссылка
  const referralLink = `https://t.me/${ctx.botInfo.username}?start=${userId}`;
  const channelLink = `https://t.me/${CHANNEL_ID}`;

  await ctx.reply(
    `Привет, ${username}! Вот твоя уникальная реферальная ссылка: \n🔗 ${referralLink}\n\n📢 Приглашай друзей в канал: ${channelLink}\n\n👥 Чем больше друзей ты пригласишь, тем выше твой рейтинг!`
  );

  if (isAdmin(userId)) {
    showAdminMenu(ctx);
  }
});

// Функция для отображения меню администратора
function showAdminMenu(ctx) {
  ctx.reply(
    "Выберите действие:",
    Markup.keyboard([
      ["Моя рефералка", "Статистика"],
    ]).resize()
  );
}

// Обработчик для "Моя рефералка" (только для админа)
bot.hears("Моя рефералка", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  const referralLink = `https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`;
  const channelLink = `https://t.me/${CHANNEL_ID}`;

  await ctx.reply(
    `Вот твоя ссылка для приглашения людей в канал:\n🔗 ${referralLink}\n\n📢 Ссылка на канал: ${channelLink}`
  );
});

// Обработчик для "Статистика" (только для админа)
bot.hears("Статистика", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  const users = await User.find().sort({ referrals: -1 });
  let message = "📊 Топ рефоводов:\n";
  
  users.forEach((u, index) => {
    message += `${index + 1}. @${u.username || "Unknown"} - ${u.referrals} подписчиков\n`;
  });

  await ctx.reply(message || "Пока никто не приглашал подписчиков.");
});

// Запуск бота
bot.launch();
