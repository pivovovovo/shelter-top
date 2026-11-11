export type ActionCardType =
  | 'swap' | 'reveal' | 'shield' | 'panic' | 'mutation' | 'referendum'
  | 'immunity' | 'doubleVote' | 'scholar' | 'joker'
  | 'changeProfession' | 'changeGender' | 'changeAge' | 'changeHealth'
  | 'changeBadHabit' | 'changeHobby' | 'changeLuggage' | 'changePhobia'
  | 'changeSpecialInfo' | 'changeFact'
  | 'forceChangeProfession' | 'forceChangeGender' | 'forceChangeAge' | 'forceChangeHealth'
  | 'forceChangeBadHabit' | 'forceChangeHobby' | 'forceChangeLuggage' | 'forceChangePhobia'
  | 'forceChangeSpecialInfo' | 'forceChangeFact'
  | 'blockVote' | 'discredit' | 'isolate'
  | 'doubleProfession' | 'doubleGender' | 'doubleAge' | 'doubleHealth'
  | 'doubleBadHabit' | 'doubleHobby' | 'doubleLuggage' | 'doublePhobia'
  | 'doubleSpecialInfo' | 'doubleFact';

export type CardPower = 'strong' | 'weak';

export interface ActionCard {
  type: ActionCardType;
  name: string;
  emoji: string;
  description: string;
  category: 'instant' | 'passive' | 'special';
  power: CardPower;
  needsTarget: boolean;
  used: boolean;
}

interface ActionCardTemplate {
  type: ActionCardType;
  name: string;
  emoji: string;
  description: string;
  category: 'instant' | 'passive' | 'special';
  power: CardPower;
  needsTarget: boolean;
}

const STRONG_CARDS: ActionCardTemplate[] = [
  { type: 'swap', name: 'Обмен', emoji: '🔁', description: 'Поменяться профессией с выбранным игроком', category: 'instant', power: 'strong', needsTarget: true },
  { type: 'reveal', name: 'Вскрытие', emoji: '👁️', description: 'Заставить игрока раскрыть 1 характеристику. Вы выбираете какую.', category: 'instant', power: 'strong', needsTarget: true },
  { type: 'shield', name: 'Защита', emoji: '🛡️', description: 'Отменить действие карты, направленной против вас', category: 'instant', power: 'strong', needsTarget: false },
  { type: 'panic', name: 'Паника', emoji: '😱', description: 'Заставить игрока раскрыть 2 характеристики вне очереди', category: 'instant', power: 'strong', needsTarget: true },
  { type: 'mutation', name: 'Мутация', emoji: '🧬', description: 'Поменять любую свою характеристику на случайную', category: 'instant', power: 'strong', needsTarget: false },
  { type: 'referendum', name: 'Референдум', emoji: '🔔', description: 'Аннулировать голосование и запустить новое. Против выбранного игрока голосовать нельзя.', category: 'instant', power: 'strong', needsTarget: true },
  { type: 'immunity', name: 'Иммунитет', emoji: '🛡️', description: 'Вас нельзя изгнать на следующем голосовании', category: 'passive', power: 'strong', needsTarget: false },
  { type: 'doubleVote', name: 'Двойной голос', emoji: '🗳️', description: 'Ваш голос на следующем голосовании считается за 2', category: 'passive', power: 'strong', needsTarget: false },
  { type: 'scholar', name: 'Учёный', emoji: '🎓', description: 'В этом раунде можете раскрыть на 1 характеристику больше', category: 'passive', power: 'strong', needsTarget: false },
  { type: 'joker', name: 'Джокер', emoji: '🃏', description: 'Может заменить любую другую сильную карту', category: 'special', power: 'strong', needsTarget: false },
];

const WEAK_CARDS: ActionCardTemplate[] = [
  // Свои характеристики
  { type: 'changeProfession', name: 'Смена профессии', emoji: '💼', description: 'Получить новую случайную профессию', category: 'instant', power: 'weak', needsTarget: false },
  { type: 'changeGender', name: 'Смена пола', emoji: '👤', description: 'Изменить пол на противоположный', category: 'instant', power: 'weak', needsTarget: false },
  { type: 'changeAge', name: 'Смена возраста', emoji: '🎂', description: 'Получить новый случайный возраст', category: 'instant', power: 'weak', needsTarget: false },
  { type: 'changeHealth', name: 'Смена здоровья', emoji: '❤️', description: 'Перебросить здоровье', category: 'instant', power: 'weak', needsTarget: false },
  { type: 'changeBadHabit', name: 'Смена привычек', emoji: '🚬', description: 'Избавиться от привычки или получить новую', category: 'instant', power: 'weak', needsTarget: false },
  { type: 'changeHobby', name: 'Смена хобби', emoji: '🛠️', description: 'Получить новый навык/хобби', category: 'instant', power: 'weak', needsTarget: false },
  { type: 'changeLuggage', name: 'Смена багажа', emoji: '🎒', description: 'Получить 2 новых случайных предмета', category: 'instant', power: 'weak', needsTarget: false },
  { type: 'changePhobia', name: 'Смена фобии', emoji: '😨', description: 'Избавиться от фобии или получить новую', category: 'instant', power: 'weak', needsTarget: false },
  { type: 'changeSpecialInfo', name: 'Смена доп. инфо', emoji: '🤫', description: 'Получить новую особую информацию', category: 'instant', power: 'weak', needsTarget: false },
  { type: 'changeFact', name: 'Смена факта', emoji: '💡', description: 'Получить новый случайный факт', category: 'instant', power: 'weak', needsTarget: false },
  
  // Чужие характеристики (требуют цель)
  { type: 'forceChangeProfession', name: 'Смена профессии врага', emoji: '💼', description: 'Изменить профессию выбранному игроку', category: 'instant', power: 'weak', needsTarget: true },
  { type: 'forceChangeGender', name: 'Смена пола врага', emoji: '👤', description: 'Изменить пол выбранному игроку', category: 'instant', power: 'weak', needsTarget: true },
  { type: 'forceChangeAge', name: 'Смена возраста врага', emoji: '🎂', description: 'Изменить возраст выбранному игроку', category: 'instant', power: 'weak', needsTarget: true },
  { type: 'forceChangeHealth', name: 'Смена здоровья врага', emoji: '❤️', description: 'Изменить здоровье выбранному игроку', category: 'instant', power: 'weak', needsTarget: true },
  { type: 'forceChangeBadHabit', name: 'Смена привычек врага', emoji: '🚬', description: 'Изменить привычки выбранному игроку', category: 'instant', power: 'weak', needsTarget: true },
  { type: 'forceChangeHobby', name: 'Смена хобби врага', emoji: '🛠️', description: 'Изменить хобби выбранному игроку', category: 'instant', power: 'weak', needsTarget: true },
  { type: 'forceChangeLuggage', name: 'Смена багажа врага', emoji: '🎒', description: 'Изменить багаж выбранному игроку', category: 'instant', power: 'weak', needsTarget: true },
  { type: 'forceChangePhobia', name: 'Смена фобии врага', emoji: '😨', description: 'Изменить фобию выбранному игроку', category: 'instant', power: 'weak', needsTarget: true },
  { type: 'forceChangeSpecialInfo', name: 'Смена доп. инфо врага', emoji: '🤫', description: 'Изменить доп. инфо выбранному игроку', category: 'instant', power: 'weak', needsTarget: true },
  { type: 'forceChangeFact', name: 'Смена факта врага', emoji: '💡', description: 'Изменить факт выбранному игроку', category: 'instant', power: 'weak', needsTarget: true },

  // Влияние на голосование
  { type: 'blockVote', name: 'Блокировка', emoji: '🚫', description: 'Запретить одному игроку голосовать против вас', category: 'instant', power: 'weak', needsTarget: true },
  { type: 'discredit', name: 'Дискредитация', emoji: '📢', description: 'Голос выбранного игрока не будет учитываться', category: 'instant', power: 'weak', needsTarget: true },
  { type: 'isolate', name: 'Самоизоляция', emoji: '🔒', description: 'Выбранный игрок не сможет голосовать в следующем раунде', category: 'instant', power: 'weak', needsTarget: true },

  // Профи 2в1
  { type: 'doubleProfession', name: 'Профи 2в1: Профессия', emoji: '💼', description: 'Получить вторую профессию', category: 'instant', power: 'weak', needsTarget: false },
  { type: 'doubleGender', name: 'Профи 2в1: Пол', emoji: '👤', description: 'Получить второй пол', category: 'instant', power: 'weak', needsTarget: false },
  { type: 'doubleAge', name: 'Профи 2в1: Возраст', emoji: '🎂', description: 'Получить второй возраст', category: 'instant', power: 'weak', needsTarget: false },
  { type: 'doubleHealth', name: 'Профи 2в1: Здоровье', emoji: '❤️', description: 'Получить второе здоровье', category: 'instant', power: 'weak', needsTarget: false },
  { type: 'doubleBadHabit', name: 'Профи 2в1: Привычки', emoji: '🚬', description: 'Получить вторую привычку', category: 'instant', power: 'weak', needsTarget: false },
  { type: 'doubleHobby', name: 'Профи 2в1: Хобби', emoji: '🛠️', description: 'Получить второе хобби', category: 'instant', power: 'weak', needsTarget: false },
  { type: 'doubleLuggage', name: 'Профи 2в1: Багаж', emoji: '🎒', description: 'Получить доп. багаж', category: 'instant', power: 'weak', needsTarget: false },
  { type: 'doublePhobia', name: 'Профи 2в1: Фобия', emoji: '😨', description: 'Получить вторую фобию', category: 'instant', power: 'weak', needsTarget: false },
  { type: 'doubleSpecialInfo', name: 'Профи 2в1: Доп. инфо', emoji: '🤫', description: 'Получить вторую доп. информацию', category: 'instant', power: 'weak', needsTarget: false },
  { type: 'doubleFact', name: 'Профи 2в1: Факт', emoji: '💡', description: 'Получить второй факт', category: 'instant', power: 'weak', needsTarget: false },
];

function getRandomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateActionCards(): ActionCard[] {
  const cards: ActionCard[] = [];
  
  // 1. Первая карта (20% сильная, 80% пустышка)
  const roll1 = Math.random();
  if (roll1 < 0.20) {
    const strong = getRandomElement(STRONG_CARDS);
    cards.push({ ...strong, used: false });
  } else {
    cards.push({ type: 'joker', name: 'Не повезло', emoji: '💀', description: 'Вам не повезло. Карты нет.', category: 'special', power: 'weak', needsTarget: false, used: true });
  }
  
  // 2. Вторая карта (всегда слабая)
  const weak = getRandomElement(WEAK_CARDS);
  cards.push({ ...weak, used: false });

  // 3. Третья карта (50% шанс на еще одну слабую)
  if (Math.random() < 0.50) {
    const weak3 = getRandomElement(WEAK_CARDS);
    cards.push({ ...weak3, used: false });
  }
  
  return cards;
}

export function getActionCardTemplate(type: ActionCardType): ActionCardTemplate | undefined {
  return [...STRONG_CARDS, ...WEAK_CARDS].find((card) => card.type === type);
}

export function getStrongCards(): ActionCardTemplate[] {
  return STRONG_CARDS;
}