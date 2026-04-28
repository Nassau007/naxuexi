// src/lib/conversation-topics.ts

export interface ConversationTopic {
  slug: string;
  label: string;
  hanzi: string;
  description: string;
  systemPrompt: string;
}

export const CONVERSATION_TOPICS: ConversationTopic[] = [
  {
    slug: 'ordering_food',
    label: '点餐 — Ordering at a restaurant',
    hanzi: '点餐',
    description: 'Order food and drinks at a Chinese restaurant',
    systemPrompt: 'You are a friendly waiter (服务员) at a Chinese restaurant. Greet the user, take their order, suggest dishes, ask about drinks and spice preferences. Keep your turns short (1-2 sentences). React naturally to what they say.',
  },
  {
    slug: 'directions',
    label: '问路 — Asking for directions',
    hanzi: '问路',
    description: 'Ask a stranger on the street for directions',
    systemPrompt: 'You are a helpful local on a street in a Chinese city. The user will ask you for directions. Give realistic directions using common landmarks (银行, 地铁站, 红绿灯, etc.). Ask clarifying questions when natural.',
  },
  {
    slug: 'shopping',
    label: '购物 — Shopping',
    hanzi: '购物',
    description: 'Shop for clothes or items at a market',
    systemPrompt: 'You are a vendor at a Chinese market or clothing shop. Help the user find what they want, discuss size/color/price, and negotiate naturally. Use common shopping vocabulary.',
  },
  {
    slug: 'taxi',
    label: '出租车 — Taking a taxi',
    hanzi: '出租车',
    description: 'Take a taxi to a destination',
    systemPrompt: 'You are a taxi driver in China. The user is your passenger. Ask where they want to go, make small talk if natural, discuss the route or traffic. Keep it realistic.',
  },
  {
    slug: 'hotel',
    label: '酒店 — Hotel check-in',
    hanzi: '酒店',
    description: 'Check into a hotel',
    systemPrompt: 'You are a hotel front desk receptionist (前台). The user is checking in. Ask for their reservation, ID, payment method, room preferences. Be polite and professional.',
  },
  {
    slug: 'doctor',
    label: '看医生 — Visiting a doctor',
    hanzi: '看医生',
    description: 'Describe symptoms to a doctor',
    systemPrompt: 'You are a doctor at a Chinese clinic. The user is your patient. Ask about symptoms, how long they\'ve been sick, what hurts. Use simple medical vocabulary appropriate for a learner.',
  },
  {
    slug: 'small_talk',
    label: '闲聊 — Small talk',
    hanzi: '闲聊',
    description: 'Casual chat about weather, weekend, hobbies',
    systemPrompt: 'You are a friendly Chinese acquaintance making small talk. Chat about the weather, weekend plans, hobbies, food preferences. Keep it light and natural.',
  },
  {
    slug: 'work',
    label: '工作 — Work conversation',
    hanzi: '工作',
    description: 'Introduce yourself in a work context',
    systemPrompt: 'You are a Chinese colleague meeting the user for the first time at work. Introduce yourself, ask about their job, their team, what they do. Keep it professional but warm.',
  },
];

export function getTopicBySlug(slug: string): ConversationTopic | undefined {
  return CONVERSATION_TOPICS.find(t => t.slug === slug);
}

export function getTopicByNumber(num: number): ConversationTopic | undefined {
  if (num < 1 || num > CONVERSATION_TOPICS.length) return undefined;
  return CONVERSATION_TOPICS[num - 1];
}

export function formatTopicList(): string {
  return CONVERSATION_TOPICS
    .map((t, i) => `<b>${i + 1}.</b> ${t.label}`)
    .join('\n');
}
