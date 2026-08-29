/**
 * Entity record types for the in-memory mock Stash server.
 *
 * These are intentionally close to (but hand-written independently of) the Stash GraphQL
 * types — see `test/meta.test.ts` for the guarantee that the shape we serve satisfies the
 * real documents the app sends. Fields which the mock does not model are simply omitted;
 * GraphQL only errors when an omitted field is non-null *and* queried.
 */

export interface FingerprintRecord {
  type: string;
  value: string;
}

export interface VideoFileRecord {
  id: string;
  path: string;
  basename: string;
  parent_folder_id: string;
  size: number;
  mod_time: string;
  duration: number;
  video_codec: string;
  audio_codec: string;
  format: string;
  width: number;
  height: number;
  frame_rate: number;
  bit_rate: number;
  fingerprints: FingerprintRecord[];
  created_at: string;
  updated_at: string;
}

export interface SceneRecord {
  id: string;
  title: string | null;
  code: string | null;
  details: string | null;
  director: string | null;
  urls: string[];
  date: string | null;
  rating100: number | null;
  organized: boolean;
  interactive: boolean;
  interactive_speed: number | null;
  created_at: string;
  updated_at: string;
  last_played_at: string | null;
  resume_time: number | null;
  play_duration: number | null;
  play_count: number | null;
  play_history: string[];
  o_history: string[];
  files: VideoFileRecord[];
  studio_id: string | null;
  tag_ids: string[];
  performer_ids: string[];
}

export interface MarkerRecord {
  id: string;
  scene_id: string;
  title: string;
  seconds: number;
  end_seconds: number | null;
  primary_tag_id: string;
  tag_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface TagRecord {
  id: string;
  name: string;
  aliases: string[];
  parent_ids: string[];
  child_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface PerformerRecord {
  id: string;
  name: string;
  disambiguation: string | null;
  gender: string | null;
  birthdate: string | null;
  ethnicity: string | null;
  country: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudioRecord {
  id: string;
  name: string;
  url: string | null;
  parent_studio_id: string | null;
  created_at: string;
  updated_at: string;
}

export type FilterMode = "SCENES" | "SCENE_MARKERS";

export interface SavedFindFilter {
  q: string | null;
  page: number | null;
  per_page: number | null;
  sort: string | null;
  direction: "ASC" | "DESC" | null;
}

export interface SavedFilterRecord {
  id: string;
  mode: FilterMode;
  name: string;
  find_filter: SavedFindFilter | null;
  object_filter: Record<string, unknown> | null;
  ui_options: Record<string, unknown> | null;
}

export type JobStatus = "READY" | "RUNNING" | "FINISHED" | "STOPPING" | "CANCELLED" | "FAILED";

export interface JobRecord {
  id: string;
  status: JobStatus;
  subTasks: string[] | null;
  description: string;
  progress: number | null;
  startTime: string | null;
  endTime: string | null;
  addTime: string;
  error: string | null;
}

/** The complete set of data a mock server instance is seeded with. */
export interface Fixtures {
  scenes: SceneRecord[];
  markers: MarkerRecord[];
  tags: TagRecord[];
  performers: PerformerRecord[];
  studios: StudioRecord[];
  savedFilters: SavedFilterRecord[];
  /** plugin id -> plugin config map, served via `configuration.plugins` */
  pluginConfig: Record<string, Record<string, unknown>>;
  /** served via `configuration.ui` */
  uiConfig: Record<string, unknown>;
}
