import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const starterWords = [
  // Numbers
  { hanzi: '一', pinyin: 'yī', meaning: 'one', category: 'number', hskLevel: 1 },
  { hanzi: '二', pinyin: 'èr', meaning: 'two', category: 'number', hskLevel: 1 },
  { hanzi: '三', pinyin: 'sān', meaning: 'three', category: 'number', hskLevel: 1 },
  { hanzi: '四', pinyin: 'sì', meaning: 'four', category: 'number', hskLevel: 1 },
  { hanzi: '五', pinyin: 'wǔ', meaning: 'five', category: 'number', hskLevel: 1 },
  { hanzi: '十', pinyin: 'shí', meaning: 'ten', category: 'number', hskLevel: 1 },
  { hanzi: '百', pinyin: 'bǎi', meaning: 'hundred', category: 'number', hskLevel: 2 },

  // People
  { hanzi: '人', pinyin: 'rén', meaning: 'person', category: 'people', hskLevel: 1 },
  { hanzi: '我', pinyin: 'wǒ', meaning: 'I / me', category: 'people', hskLevel: 1 },
  { hanzi: '你', pinyin: 'nǐ', meaning: 'you', category: 'people', hskLevel: 1 },
  { hanzi: '他', pinyin: 'tā', meaning: 'he / him', category: 'people', hskLevel: 1 },
  { hanzi: '她', pinyin: 'tā', meaning: 'she / her', category: 'people', hskLevel: 1 },
  { hanzi: '朋友', pinyin: 'péng yǒu', meaning: 'friend', category: 'people', hskLevel: 1 },
  { hanzi: '老师', pinyin: 'lǎo shī', meaning: 'teacher', category: 'people', hskLevel: 1 },

  // Food
  { hanzi: '水', pinyin: 'shuǐ', meaning: 'water', category: 'food', hskLevel: 1 },
  { hanzi: '茶', pinyin: 'chá', meaning: 'tea', category: 'food', hskLevel: 1 },
  { hanzi: '米饭', pinyin: 'mǐ fàn', meaning: 'rice', category: 'food', hskLevel: 1 },
  { hanzi: '菜', pinyin: 'cài', meaning: 'vegetable / dish', category: 'food', hskLevel: 1 },
  { hanzi: '肉', pinyin: 'ròu', meaning: 'meat', category: 'food', hskLevel: 2 },

  // Verbs
  { hanzi: '是', pinyin: 'shì', meaning: 'to be', category: 'verb', hskLevel: 1 },
  { hanzi: '有', pinyin: 'yǒu', meaning: 'to have', category: 'verb', hskLevel: 1 },
  { hanzi: '去', pinyin: 'qù', meaning: 'to go', category: 'verb', hskLevel: 1 },
  { hanzi: '来', pinyin: 'lái', meaning: 'to come', category: 'verb', hskLevel: 1 },
  { hanzi: '吃', pinyin: 'chī', meaning: 'to eat', category: 'verb', hskLevel: 1 },
  { hanzi: '喝', pinyin: 'hē', meaning: 'to drink', category: 'verb', hskLevel: 1 },
  { hanzi: '看', pinyin: 'kàn', meaning: 'to look / watch', category: 'verb', hskLevel: 1 },
  { hanzi: '说', pinyin: 'shuō', meaning: 'to speak / say', category: 'verb', hskLevel: 1 },
  { hanzi: '学', pinyin: 'xué', meaning: 'to study / learn', category: 'verb', hskLevel: 1 },
  { hanzi: '买', pinyin: 'mǎi', meaning: 'to buy', category: 'verb', hskLevel: 1 },

  // Places
  { hanzi: '中国', pinyin: 'zhōng guó', meaning: 'China', category: 'place', hskLevel: 1 },
  { hanzi: '学校', pinyin: 'xué xiào', meaning: 'school', category: 'place', hskLevel: 1 },
  { hanzi: '家', pinyin: 'jiā', meaning: 'home / family', category: 'place', hskLevel: 1 },
  { hanzi: '商店', pinyin: 'shāng diàn', meaning: 'shop / store', category: 'place', hskLevel: 2 },

  // Common
  { hanzi: '好', pinyin: 'hǎo', meaning: 'good', category: 'adjective', hskLevel: 1 },
  { hanzi: '大', pinyin: 'dà', meaning: 'big', category: 'adjective', hskLevel: 1 },
  { hanzi: '小', pinyin: 'xiǎo', meaning: 'small', category: 'adjective', hskLevel: 1 },
  { hanzi: '多', pinyin: 'duō', meaning: 'many / much', category: 'adjective', hskLevel: 1 },
  { hanzi: '谢谢', pinyin: 'xiè xie', meaning: 'thank you', category: 'greeting', hskLevel: 1 },
  { hanzi: '你好', pinyin: 'nǐ hǎo', meaning: 'hello', category: 'greeting', hskLevel: 1 },
  { hanzi: '再见', pinyin: 'zài jiàn', meaning: 'goodbye', category: 'greeting', hskLevel: 1 },
];

async function seed() {
  console.log('🌱 Seeding database...');

  for (const word of starterWords) {
    await prisma.word.upsert({
      where: { hanzi: word.hanzi },
      update: {},
      create: word,
    });
  }

  // Default settings
  await prisma.setting.upsert({
    where: { key: 'dailyHanziCount' },
    update: {},
    create: { key: 'dailyHanziCount', value: '15' },
  });

  await prisma.setting.upsert({
    where: { key: 'dailyHanziTime' },
    update: {},
    create: { key: 'dailyHanziTime', value: '08:00' },
  });

  const count = await prisma.word.count();
  console.log(`✅ Done! ${count} words in database.`);
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
