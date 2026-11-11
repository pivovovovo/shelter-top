import { Room, RoomRepository, Player, ChatMessage, Vote } from './types';

export class InMemoryRoomRepository implements RoomRepository {
  private rooms: Map<string, Room> = new Map();

  createRoom(roomId: string, hostPlayer: Player, maxPlayers: number, bunkerCapacity: number): Room {
    const newRoom: Room = {
      id: roomId,
      players: new Map([[hostPlayer.id, hostPlayer]]),
      maxPlayers,
      bunkerCapacity,
      currentRound: 1,
      currentSpeaker: null,
      allRevealed: false,
      catastrophe: null,
      bunker: null,
      lastVotingResult: null,
      pendingRevealRequests: [],
      referendumActive: false,
      referendumProtectedId: null,
      status: 'lobby',
      messages: [],
      votes: [],
    };
    this.rooms.set(roomId, newRoom);
    return newRoom;
  }

  findRoomById(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  addPlayerToRoom(roomId: string, player: Player): Room | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    room.players.set(player.id, player);
    return room;
  }

  removePlayerFromRoom(roomId: string, playerId: string): Room | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    room.players.delete(playerId);
    return room;
  }

  deleteRoom(roomId: string): void {
    this.rooms.delete(roomId);
  }

  findRoomBySocketId(socketId: string): { roomId: string; room: Room } | undefined {
    for (const [roomId, room] of this.rooms.entries()) {
      const player = Array.from(room.players.values()).find((p) => p.socketId === socketId);
      if (player) return { roomId, room };
    }
    return undefined;
  }

  addMessageToRoom(roomId: string, message: ChatMessage): Room | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    room.messages.push(message);
    if (room.messages.length > 100) room.messages = room.messages.slice(-100);
    return room;
  }

  addVoteToRoom(roomId: string, vote: Vote): Room | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    room.votes = room.votes.filter((v) => v.voterId !== vote.voterId);
    room.votes.push(vote);
    return room;
  }
}