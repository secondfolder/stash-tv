/**
 * Ids for the conformance tests and seeding: a real Stash chooses its own ids, so each mock (fixture) id is mapped to
 * the one the real Stash gave the same entity. Kept apart from the seeding, which needs Docker, so the cases can import
 * it alone.
 */

/** The types of entity whose ids the real Stash chooses for itself */
export type EntityType = "Scene" | "VideoFile" | "SceneMarker" | "Tag" | "Performer" | "Studio" | "SavedFilter";
export const ENTITY_TYPES: readonly EntityType[] = ["Scene", "VideoFile", "SceneMarker", "Tag", "Performer", "Studio", "SavedFilter"];

/** Which real Stash id each mock (fixture) id became, by entity type */
export class IdMap {
  private realIds = new Map<string, string>();
  private mockIds = new Map<string, string>();

  set(type: EntityType, mockId: string, realId: string) {
    this.realIds.set(`${type}:${mockId}`, realId);
    this.mockIds.set(`${type}:${realId}`, mockId);
  }

  /** The real Stash's id for a mock id */
  real(type: EntityType, mockId: string): string {
    const realId = this.realIds.get(`${type}:${mockId}`);
    if (realId === undefined) throw new Error(`No real Stash ${type} for the mock's ${mockId}`);
    return realId;
  }

  has(type: EntityType, mockId: string): boolean {
    return this.realIds.has(`${type}:${mockId}`);
  }

  /** The mock's id for a real Stash id, if it's one the map knows */
  mock(type: EntityType, realId: string): string | undefined {
    return this.mockIds.get(`${type}:${realId}`);
  }

  entries(): [string, string][] {
    return [...this.realIds.entries()];
  }
}

/** Criteria in a saved filter that hold entity ids, as Stash's UI saves them (`{ value: { items: [{ id }] } }`) */
const SAVED_FILTER_ID_CRITERIA: Record<string, EntityType> = { tags: "Tag", performers: "Performer", studios: "Studio" };

/** A saved filter's criteria with each entity id translated (to the real Stash's, or back to the mock's) */
export function translateFilterIds(
  objectFilter: Record<string, unknown> | null | undefined,
  translate: (type: EntityType, id: string) => string,
): Record<string, unknown> | null {
  if (!objectFilter) return objectFilter ?? null;
  const translated = structuredClone(objectFilter);
  for (const [criterion, type] of Object.entries(SAVED_FILTER_ID_CRITERIA)) {
    const value = (translated[criterion] as { value?: { items?: { id: string }[], excluded?: { id: string }[] } } | undefined)?.value;
    for (const list of [value?.items, value?.excluded]) {
      for (const item of list ?? []) item.id = translate(type, item.id);
    }
  }
  return translated;
}
