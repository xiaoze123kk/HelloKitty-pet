import type { WardrobeSnapshot } from "../growth/wardrobe";
import type { UserMemory } from "../memory/userMemory";
import type { RelationshipSnapshot } from "../relationship/relationshipEngine";

export interface NestSnapshot extends RelationshipSnapshot {
  wardrobe: WardrobeSnapshot;
  userMemories: UserMemory[];
}
