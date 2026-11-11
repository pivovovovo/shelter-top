import { z } from 'zod';
import type { Catastrophe } from './catastropheGenerator';
import type { Bunker } from './bunkerGenerator';
import type { ActionCard, ActionCardType } from './actionCardGenerator';

export interface CharacterCard {
  profession: string; profession2?: string;
  gender: string; gender2?: string;
  age: string; age2?: string;
  health: string; health2?: string;
  badHabit: string; badHabit2?: string;
  hobby: string; hobby2?: string;
  luggage: string[]; luggage2?: string[];
  phobia: string; phobia2?: string;
  specialInfo: string; specialInfo2?: string;
  fact: string; fact2?: string;
}

export type RevealedField =
  | 'profession' | 'gender' | 'age' | 'health' | 'badHabit'
  | 'hobby' | 'luggage' | 'phobia' | 'specialInfo' | 'fact';

export const ALL_FIELDS: RevealedField[] = [
  'profession', 'gender', 'age', 'health', 'badHabit',
  'hobby', 'luggage', 'phobia', 'specialInfo', 'fact'
];

export interface Player {
  id: string;
  socketId: string;
  name: string;
  userId?: string;
  isHost: boolean;
  card?: CharacterCard;
  isAlive: boolean;
  revealedFields: RevealedField[];
  revealedThisRound: RevealedField[];
  actionCards: ActionCard[];
  hasImmunity: boolean;
  hasDoubleVote: boolean;
  hasScholar: boolean;
  shieldActive: boolean;
  hostBonusVotes: number;
  isDiscredited: boolean;
  isIsolated: boolean;
  blockedFromVoting: string[];
  pendingMutationField: RevealedField | null;
}

export interface ChatMessage {
  id: string; playerId: string; playerName: string; text: string; timestamp: number;
}

export interface Vote {
  voterId: string; targetId: string;
}

export interface PendingRevealRequest {
  id: string; targetPlayerId: string; sourcePlayerId: string; cardType: 'panic'; count: number; createdAt: number;
}

export interface Room {
  id: string;
  password?: string;
  creatorId: string; // 👈 ДОБАВЛЕНО
  players: Map<string, Player>;
  maxPlayers: number;
  bunkerCapacity: number;
  currentRound: number;
  currentSpeaker: string | null;
  allRevealed: boolean;
  catastrophe: Catastrophe | null;
  bunker: Bunker | null;
  lastVotingResult: { excludedPlayerId: string | null; voteCounts: Record<string, number>; } | null;
  pendingRevealRequests: PendingRevealRequest[];
  referendumActive: boolean;
  referendumProtectedId: string | null;
  status: 'lobby' | 'discussion' | 'voting' | 'results' | 'finished';
  messages: ChatMessage[];
  votes: Vote[];
}

export interface RoomRepository {
  createRoom(roomId: string, hostPlayer: Player, maxPlayers: number, bunkerCapacity: number, password?: string): Room;
  findRoomById(roomId: string): Room | undefined;
  addPlayerToRoom(roomId: string, player: Player): Room | undefined;
  removePlayerFromRoom(roomId: string, playerId: string): Room | undefined;
  deleteRoom(roomId: string): void;
  findRoomBySocketId(socketId: string): { roomId: string; room: Room } | undefined;
  addMessageToRoom(roomId: string, message: ChatMessage): Room | undefined;
  addVoteToRoom(roomId: string, vote: Vote): Room | undefined;
}

export function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export const createRoomSchema = z.object({
  playerId: z.string().min(1),
  playerName: z.string().min(1).max(30),
  maxPlayers: z.number().min(2).max(16),
  bunkerCapacity: z.number().min(1).max(15),
  password: z.string().optional(),
});

export const joinRoomSchema = z.object({
  roomId: z.string().min(1),
  playerId: z.string().min(1),
  playerName: z.string().min(1).max(30),
  password: z.string().optional(),
});

export const startGameSchema = z.object({ roomId: z.string().min(1), playerId: z.string().min(1) });
export const roomActionSchema = z.object({ roomId: z.string().min(1), playerId: z.string().min(1) });
export const sendMessageSchema = z.object({ roomId: z.string().min(1), playerId: z.string().min(1), playerName: z.string().min(1), text: z.string().min(1).max(500) });
export const voteSchema = z.object({ roomId: z.string().min(1), playerId: z.string().min(1), targetPlayerId: z.string().min(1) });
export const revealCardSchema = z.object({ roomId: z.string().min(1), playerId: z.string().min(1), field: z.enum(ALL_FIELDS as [RevealedField, ...RevealedField[]]) });

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type JoinRoomInput = z.infer<typeof joinRoomSchema>;
export type StartGameInput = z.infer<typeof startGameSchema>;
export type RoomActionInput = z.infer<typeof roomActionSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type VoteInput = z.infer<typeof voteSchema>;
export type RevealCardInput = z.infer<typeof revealCardSchema>;