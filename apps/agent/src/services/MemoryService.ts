import type { Json } from "@ai-assistant/shared";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { supabase } from "./supabase.js";

export const DEFAULT_MEMORY_ROOT = fileURLToPath(
  new URL("../../data/memory", import.meta.url),
);

export const MEMORY_ARTIFACT_FILENAMES = {
  persona: "persona.md",
  short_term: "short-term.md",
  weekly_memory: "weekly-memory.md",
  long_term: "long-term.md",
  task_state: "task-state.json",
} as const;

export type MemoryArtifactType = keyof typeof MEMORY_ARTIFACT_FILENAMES;
export type MemoryFileIndex = Record<MemoryArtifactType, string>;

export interface MemoryTaskState extends Record<string, Json | undefined> {
  task_id?: string;
  status?: string;
  current_node?: string;
  domain_action?: string;
  updated_at?: string;
}

export interface MemoryContextSnapshot {
  files: MemoryFileIndex;
  persona: string;
  short_term: string;
  weekly_memory: string;
  long_term: string;
  task_state: MemoryTaskState;
}

export interface StartupMemoryContextSnapshot {
  files: MemoryFileIndex;
  persona: string;
  weekly_memory: string;
  long_term: string;
  task_state: MemoryTaskState;
}

type MemoryArtifactValueMap = {
  persona: string;
  short_term: string;
  weekly_memory: string;
  long_term: string;
  task_state: MemoryTaskState;
};

interface MemoryServiceOptions {
  memoryRoot?: string;
}

const MEMORY_LOCK_RETRY_DELAY_MS = 10;
const MEMORY_LOCK_MAX_ATTEMPTS = 50;

const DEFAULT_PERSONA_TEMPLATE = [
  "# Persona",
  "",
  "- Identity: User-specific assistant context not configured yet.",
  "- Role: Capture stable preferences, voice, and responsibilities here.",
].join("\n");

const DEFAULT_MARKDOWN_MEMORY = {
  short_term: "# Short-Term Memory\n",
  weekly_memory: "# Weekly Memory\n",
  long_term: "# Long-Term Memory\n",
} as const;

function assertValidPathSegment(value: string, label: string): string {
  const normalizedValue = value.trim();

  if (
    normalizedValue.length === 0 ||
    normalizedValue === "." ||
    normalizedValue === ".." ||
    normalizedValue.includes("/") ||
    normalizedValue.includes("\\")
  ) {
    throw new Error(`Invalid ${label}`);
  }

  return normalizedValue;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function isLockConflictError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "EEXIST"
  );
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getDefaultArtifactContent<T extends MemoryArtifactType>(
  artifactType: T,
): MemoryArtifactValueMap[T] {
  if (artifactType === "persona") {
    return DEFAULT_PERSONA_TEMPLATE as MemoryArtifactValueMap[T];
  }

  if (artifactType === "task_state") {
    return {} as MemoryArtifactValueMap[T];
  }

  return DEFAULT_MARKDOWN_MEMORY[
    artifactType as keyof typeof DEFAULT_MARKDOWN_MEMORY
  ] as MemoryArtifactValueMap[T];
}

function serializeArtifactContent<T extends MemoryArtifactType>(
  artifactType: T,
  content: MemoryArtifactValueMap[T],
): string {
  if (artifactType === "task_state") {
    return `${JSON.stringify(content, null, 2)}\n`;
  }

  if (typeof content !== "string") {
    throw new Error(`Invalid content for ${artifactType}`);
  }

  return content;
}

function parseArtifactContent<T extends MemoryArtifactType>(
  artifactType: T,
  rawContent: string,
): MemoryArtifactValueMap[T] {
  if (artifactType === "task_state") {
    if (rawContent.trim().length === 0) {
      return {} as MemoryArtifactValueMap[T];
    }

    return JSON.parse(rawContent) as MemoryArtifactValueMap[T];
  }

  return rawContent as MemoryArtifactValueMap[T];
}

export class MemoryService {
  private readonly memoryRoot: string;

  constructor(options: MemoryServiceOptions = {}) {
    this.memoryRoot = resolve(options.memoryRoot ?? DEFAULT_MEMORY_ROOT);
  }

  getOrganizationDirectory(organizationId: string): string {
    const normalizedOrganizationId = assertValidPathSegment(
      organizationId,
      "organization id",
    );
    const organizationDirectory = resolve(
      this.memoryRoot,
      normalizedOrganizationId,
    );

    if (!organizationDirectory.startsWith(`${this.memoryRoot}${sep}`)) {
      throw new Error("Invalid organization id");
    }

    return organizationDirectory;
  }

  getUserDirectory(organizationId: string, userId: string): string {
    const organizationDirectory = this.getOrganizationDirectory(organizationId);
    const normalizedUserId = assertValidPathSegment(userId, "user id");
    const userDirectory = resolve(organizationDirectory, normalizedUserId);

    if (!userDirectory.startsWith(`${organizationDirectory}${sep}`)) {
      throw new Error("Invalid user id");
    }

    return userDirectory;
  }

  async ensureUserDirectory(
    organizationId: string,
    userId: string,
  ): Promise<string> {
    const userDirectory = this.getUserDirectory(organizationId, userId);
    await mkdir(userDirectory, { recursive: true });
    return userDirectory;
  }

  resolveArtifactPath(
    organizationId: string,
    userId: string,
    artifactType: MemoryArtifactType,
  ): string {
    return resolve(
      this.getUserDirectory(organizationId, userId),
      MEMORY_ARTIFACT_FILENAMES[artifactType],
    );
  }

  buildMemoryFileIndex(
    organizationId: string,
    userId: string,
  ): MemoryFileIndex {
    return {
      persona: this.resolveArtifactPath(organizationId, userId, "persona"),
      short_term: this.resolveArtifactPath(
        organizationId,
        userId,
        "short_term",
      ),
      weekly_memory: this.resolveArtifactPath(
        organizationId,
        userId,
        "weekly_memory",
      ),
      long_term: this.resolveArtifactPath(organizationId, userId, "long_term"),
      task_state: this.resolveArtifactPath(
        organizationId,
        userId,
        "task_state",
      ),
    };
  }

  private async withArtifactLock<T>(
    artifactPath: string,
    callback: () => Promise<T>,
  ): Promise<T> {
    const lockPath = `${artifactPath}.lock`;

    for (let attempt = 0; attempt < MEMORY_LOCK_MAX_ATTEMPTS; attempt += 1) {
      let handle:
        | {
            close: () => Promise<void>;
          }
        | undefined;

      try {
        handle = await open(lockPath, "wx");

        try {
          return await callback();
        } finally {
          await handle.close().catch(() => undefined);
          await rm(lockPath, { force: true }).catch(() => undefined);
        }
      } catch (error) {
        if (
          !isLockConflictError(error) ||
          attempt === MEMORY_LOCK_MAX_ATTEMPTS - 1
        ) {
          throw error;
        }

        await sleep(MEMORY_LOCK_RETRY_DELAY_MS * (attempt + 1));
      }
    }

    throw new Error(`Unable to acquire memory lock for ${artifactPath}`);
  }

  private async readArtifactFile<T extends MemoryArtifactType>(
    artifactPath: string,
    artifactType: T,
  ): Promise<MemoryArtifactValueMap[T]> {
    const content = await readFile(artifactPath, "utf8");
    return parseArtifactContent(artifactType, content);
  }

  private async readArtifactOrDefault<T extends MemoryArtifactType>(
    artifactPath: string,
    artifactType: T,
  ): Promise<MemoryArtifactValueMap[T]> {
    try {
      return await this.readArtifactFile(artifactPath, artifactType);
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }

      return cloneJson(getDefaultArtifactContent(artifactType));
    }
  }

  private async writeArtifactFile<T extends MemoryArtifactType>(
    artifactPath: string,
    artifactType: T,
    content: MemoryArtifactValueMap[T],
  ): Promise<string> {
    const serializedContent = serializeArtifactContent(artifactType, content);
    const tempPath = `${artifactPath}.tmp-${process.pid}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    try {
      await writeFile(tempPath, serializedContent, "utf8");
      await rename(tempPath, artifactPath);
      return artifactPath;
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async syncMemoryFileIndex(
    organizationId: string,
    userId: string,
  ): Promise<MemoryFileIndex> {
    const memoryFileIndex = this.buildMemoryFileIndex(organizationId, userId);

    const { data, error } = await supabase
      .from("profiles")
      .update({
        memory_file_paths: memoryFileIndex,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .eq("organization_id", organizationId)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to sync memory file paths: ${error.message}`);
    }

    if (!data) {
      throw new Error(
        `Failed to sync memory file paths: profile ${userId} was not found for organization ${organizationId}`,
      );
    }

    return memoryFileIndex;
  }

  async initializeUserMemory(
    organizationId: string,
    userId: string,
  ): Promise<MemoryFileIndex> {
    await this.ensureUserDirectory(organizationId, userId);
    const fileIndex = await this.syncMemoryFileIndex(organizationId, userId);
    await this.readMemory(organizationId, userId, "persona");
    return fileIndex;
  }

  async readMemory<T extends MemoryArtifactType>(
    organizationId: string,
    userId: string,
    artifactType: T,
  ): Promise<MemoryArtifactValueMap[T]> {
    const artifactPath = this.resolveArtifactPath(organizationId, userId, artifactType);

    try {
      return await this.readArtifactFile(artifactPath, artifactType);
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }

      const defaultContent = getDefaultArtifactContent(artifactType);
      await this.writeMemory(organizationId, userId, artifactType, defaultContent);
      return cloneJson(defaultContent);
    }
  }

  async readMemoryIfExists<T extends MemoryArtifactType>(
    organizationId: string,
    userId: string,
    artifactType: T,
  ): Promise<MemoryArtifactValueMap[T] | null> {
    const artifactPath = this.resolveArtifactPath(organizationId, userId, artifactType);

    try {
      return await this.readArtifactFile(artifactPath, artifactType);
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }

      return null;
    }
  }

  async writeMemory<T extends MemoryArtifactType>(
    organizationId: string,
    userId: string,
    artifactType: T,
    content: MemoryArtifactValueMap[T],
  ): Promise<string> {
    const artifactPath = this.resolveArtifactPath(organizationId, userId, artifactType);

    await this.ensureUserDirectory(organizationId, userId);

    return this.withArtifactLock(artifactPath, () =>
      this.writeArtifactFile(artifactPath, artifactType, content),
    );
  }

  async updateTaskState(
    organizationId: string,
    userId: string,
    taskId: string,
    state: MemoryTaskState,
  ): Promise<MemoryTaskState> {
    const artifactPath = this.resolveArtifactPath(organizationId, userId, "task_state");

    await this.ensureUserDirectory(organizationId, userId);

    return this.withArtifactLock(artifactPath, async () => {
      const currentState = await this.readArtifactOrDefault(artifactPath, "task_state");
      const nextState: MemoryTaskState = {
        ...currentState,
        ...state,
        task_id: taskId,
        updated_at: new Date().toISOString(),
      };

      await this.writeArtifactFile(artifactPath, "task_state", nextState);
      return nextState;
    });
  }

  async loadStartupMemoryContext(
    organizationId: string,
    userId: string,
  ): Promise<StartupMemoryContextSnapshot> {
    const files = await this.initializeUserMemory(organizationId, userId);
    const [persona, weeklyMemory, longTerm, taskState] = await Promise.all([
      this.readMemory(organizationId, userId, "persona"),
      this.readMemory(organizationId, userId, "weekly_memory"),
      this.readMemory(organizationId, userId, "long_term"),
      this.readMemory(organizationId, userId, "task_state"),
    ]);

    return {
      files,
      persona,
      weekly_memory: weeklyMemory,
      long_term: longTerm,
      task_state: taskState,
    };
  }

  async loadShortTermMemory(
    organizationId: string,
    userId: string,
  ): Promise<string> {
    await this.ensureUserDirectory(organizationId, userId);
    return this.readMemory(organizationId, userId, "short_term");
  }

  async loadMemoryContext(
    organizationId: string,
    userId: string,
  ): Promise<MemoryContextSnapshot> {
    const files = await this.initializeUserMemory(organizationId, userId);
    const [persona, shortTerm, weeklyMemory, longTerm, taskState] =
      await Promise.all([
        this.readMemory(organizationId, userId, "persona"),
        this.readMemory(organizationId, userId, "short_term"),
        this.readMemory(organizationId, userId, "weekly_memory"),
        this.readMemory(organizationId, userId, "long_term"),
        this.readMemory(organizationId, userId, "task_state"),
      ]);

    return {
      files,
      persona,
      short_term: shortTerm,
      weekly_memory: weeklyMemory,
      long_term: longTerm,
      task_state: taskState,
    };
  }
}

export const memoryService = new MemoryService();
