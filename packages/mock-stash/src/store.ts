import { createEventEmitter, type EventEmitter } from "./events";
import type {
  Fixtures,
  JobRecord,
  MarkerRecord,
  PerformerRecord,
  SceneRecord,
  SavedFilterRecord,
  StudioRecord,
  TagRecord,
} from "./types";

export interface JobStatusUpdateEvent {
  type: "ADD" | "REMOVE" | "UPDATE";
  job: JobRecord;
}

export interface MockStore {
  readonly scenes: Map<string, SceneRecord>;
  readonly markers: Map<string, MarkerRecord>;
  readonly tags: Map<string, TagRecord>;
  readonly performers: Map<string, PerformerRecord>;
  readonly studios: Map<string, StudioRecord>;
  readonly savedFilters: Map<string, SavedFilterRecord>;
  /** plugin id -> config map (`configuration.plugins` / `configurePlugin`) */
  pluginConfig: Record<string, Record<string, unknown>>;
  /** `configuration.ui` / `configureUI` */
  uiConfig: Record<string, unknown>;
  /** last `configureInterface` input (interface config is otherwise static) */
  lastInterfaceConfig: Record<string, unknown> | null;
  readonly jobs: Map<string, JobRecord>;
  readonly scanComplete: EventEmitter<void>;
  readonly jobsUpdated: EventEmitter<JobStatusUpdateEvent>;
  now: () => string;
  nextMarkerId(): string;
  nextTagId(): string;
  nextJobId(): string;
  nextFilterId(): string;
}

export function createStore(fixtures: Fixtures): MockStore {
  return {
    scenes: new Map(fixtures.scenes.map((s) => [s.id, s])),
    markers: new Map(fixtures.markers.map((m) => [m.id, m])),
    tags: new Map(fixtures.tags.map((t) => [t.id, t])),
    performers: new Map(fixtures.performers.map((p) => [p.id, p])),
    studios: new Map(fixtures.studios.map((s) => [s.id, s])),
    savedFilters: new Map(fixtures.savedFilters.map((f) => [f.id, f])),
    pluginConfig: structuredClone(fixtures.pluginConfig),
    uiConfig: structuredClone(fixtures.uiConfig),
    lastInterfaceConfig: null,
    jobs: new Map(),
    scanComplete: createEventEmitter<void>(),
    jobsUpdated: createEventEmitter<JobStatusUpdateEvent>(),
    now: () => new Date().toISOString(),
    nextMarkerId: idCounter("marker", fixtures.markers.length),
    nextTagId: idCounter("tag", fixtures.tags.length),
    nextJobId: idCounter("job", 0),
    nextFilterId: idCounter("filter", fixtures.savedFilters.length),
  };
}

function idCounter(prefix: string, alreadyUsed: number) {
  let next = alreadyUsed + 1;
  return () => `${prefix}-${next++}`;
}

/** Expand a tag id set to include descendants (hierarchical tag criteria include children). */
export function expandTagIds(store: MockStore, tagIds: string[]): Set<string> {
  const result = new Set<string>();
  const queue = [...tagIds];
  while (queue.length) {
    const id = queue.shift()!;
    if (result.has(id)) continue;
    const tag = store.tags.get(id);
    if (!tag) continue;
    result.add(id);
    queue.push(...tag.child_ids);
  }
  return result;
}

export function markerTagIds(marker: MarkerRecord): string[] {
  return [marker.primary_tag_id, ...marker.tag_ids];
}

export function addJob(store: MockStore, description: string): JobRecord {
  const job: JobRecord = {
    id: store.nextJobId(),
    status: "FINISHED",
    subTasks: null,
    description,
    progress: 1,
    startTime: store.now(),
    endTime: store.now(),
    addTime: store.now(),
    error: null,
  };
  store.jobs.set(job.id, job);
  store.jobsUpdated.emit({ type: "ADD", job });
  return job;
}
