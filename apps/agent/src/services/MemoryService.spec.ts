import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { supabase } from "./supabase.js";
import {
  DEFAULT_MEMORY_ROOT,
  MemoryService,
  type MemoryFileIndex,
  MEMORY_ARTIFACT_FILENAMES,
} from "./MemoryService.js";

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  open: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  rm: vi.fn(),
}));

const profileUpdateQuery = {
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
};

vi.mock("./supabase.js", () => ({
  supabase: {
    from: vi.fn(() => profileUpdateQuery),
  },
}));

const fileStore = new Map<string, string>();
const lockStore = new Set<string>();

function missingFileError(): Error & { code: string } {
  return Object.assign(new Error("ENOENT"), { code: "ENOENT" });
}

function lockConflictError(): Error & { code: string } {
  return Object.assign(new Error("EEXIST"), { code: "EEXIST" });
}

describe("MemoryService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fileStore.clear();
    lockStore.clear();

    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(open).mockImplementation(async (filePath) => {
      const resolvedPath = String(filePath);
      if (lockStore.has(resolvedPath)) {
        throw lockConflictError();
      }

      lockStore.add(resolvedPath);

      return {
        close: vi.fn().mockResolvedValue(undefined),
      } as unknown as Awaited<ReturnType<typeof open>>;
    });
    vi.mocked(readFile).mockImplementation(async (filePath) => {
      const value = fileStore.get(String(filePath));
      if (typeof value === "undefined") {
        throw missingFileError();
      }
      return value;
    });
    vi.mocked(writeFile).mockImplementation(async (filePath, content) => {
      fileStore.set(String(filePath), String(content));
    });
    vi.mocked(rename).mockImplementation(async (from, to) => {
      const value = fileStore.get(String(from));
      if (typeof value === "undefined") {
        throw missingFileError();
      }
      fileStore.set(String(to), value);
      fileStore.delete(String(from));
    });
    vi.mocked(rm).mockImplementation(async (filePath) => {
      fileStore.delete(String(filePath));
      lockStore.delete(String(filePath));
    });

    profileUpdateQuery.update.mockReturnValue(profileUpdateQuery);
    profileUpdateQuery.eq.mockReturnValue(profileUpdateQuery);
    profileUpdateQuery.select.mockReturnValue(profileUpdateQuery);
    profileUpdateQuery.maybeSingle.mockResolvedValue({
      data: { id: "user-456" },
      error: null,
    });
  });

  it("resolves user-scoped artifact paths under the memory root", () => {
    const service = new MemoryService();

    expect(service.getOrganizationDirectory("org-123")).toBe(
      `${DEFAULT_MEMORY_ROOT}/org-123`,
    );
    expect(service.getUserDirectory("org-123", "user-456")).toBe(
      `${DEFAULT_MEMORY_ROOT}/org-123/user-456`,
    );
    expect(service.resolveArtifactPath("org-123", "user-456", "persona")).toBe(
      `${DEFAULT_MEMORY_ROOT}/org-123/user-456/${MEMORY_ARTIFACT_FILENAMES.persona}`,
    );
  });

  it("builds the database JSON map of memory names to file paths", () => {
    const service = new MemoryService();

    expect(service.buildMemoryFileIndex("org-123", "user-456")).toEqual<MemoryFileIndex>({
      persona: `${DEFAULT_MEMORY_ROOT}/org-123/user-456/${MEMORY_ARTIFACT_FILENAMES.persona}`,
      short_term: `${DEFAULT_MEMORY_ROOT}/org-123/user-456/${MEMORY_ARTIFACT_FILENAMES.short_term}`,
      weekly_memory: `${DEFAULT_MEMORY_ROOT}/org-123/user-456/${MEMORY_ARTIFACT_FILENAMES.weekly_memory}`,
      long_term: `${DEFAULT_MEMORY_ROOT}/org-123/user-456/${MEMORY_ARTIFACT_FILENAMES.long_term}`,
      task_state: `${DEFAULT_MEMORY_ROOT}/org-123/user-456/${MEMORY_ARTIFACT_FILENAMES.task_state}`,
    });
  });

  it("persists the memory file path map to the user profile", async () => {
    const service = new MemoryService();

    await service.syncMemoryFileIndex("org-123", "user-456");

    expect(supabase.from).toHaveBeenCalledWith("profiles");
    expect(profileUpdateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        memory_file_paths: service.buildMemoryFileIndex("org-123", "user-456"),
        updated_at: expect.any(String),
      }),
    );
    expect(profileUpdateQuery.eq).toHaveBeenNthCalledWith(1, "id", "user-456");
    expect(profileUpdateQuery.eq).toHaveBeenNthCalledWith(
      2,
      "organization_id",
      "org-123",
    );
    expect(profileUpdateQuery.select).toHaveBeenCalledWith("id");
  });

  it("fails memory file sync when the target profile does not exist", async () => {
    const service = new MemoryService();

    profileUpdateQuery.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    await expect(
      service.syncMemoryFileIndex("org-123", "user-456"),
    ).rejects.toThrow("profile user-456 was not found");
  });

  it("creates the user directory recursively", async () => {
    const service = new MemoryService();

    const directory = await service.ensureUserDirectory("org-456", "user-789");

    expect(directory).toBe(`${DEFAULT_MEMORY_ROOT}/org-456/user-789`);
    expect(mkdir).toHaveBeenCalledWith(directory, { recursive: true });
  });

  it("initializes a default persona template when persona memory is missing", async () => {
    const service = new MemoryService();

    const persona = await service.readMemory("org-123", "user-456", "persona");

    expect(persona).toContain("# Persona");
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(rename).toHaveBeenCalledWith(
      expect.stringContaining(`${MEMORY_ARTIFACT_FILENAMES.persona}.tmp-`),
      `${DEFAULT_MEMORY_ROOT}/org-123/user-456/${MEMORY_ARTIFACT_FILENAMES.persona}`,
    );
  });

  it("returns null for missing artifacts without creating defaults", async () => {
    const service = new MemoryService();

    const shortTerm = await service.readMemoryIfExists(
      "org-123",
      "user-456",
      "short_term",
    );

    expect(shortTerm).toBeNull();
    expect(writeFile).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
  });

  it("writes markdown memories atomically and reads them back", async () => {
    const service = new MemoryService();

    await service.writeMemory(
      "org-123",
      "user-456",
      "weekly_memory",
      "# Weekly Memory\n\n- Won a big deal\n",
    );

    await expect(
      service.readMemory("org-123", "user-456", "weekly_memory"),
    ).resolves.toBe("# Weekly Memory\n\n- Won a big deal\n");
    expect(rename).toHaveBeenCalledWith(
      expect.stringContaining(`${MEMORY_ARTIFACT_FILENAMES.weekly_memory}.tmp-`),
      `${DEFAULT_MEMORY_ROOT}/org-123/user-456/${MEMORY_ARTIFACT_FILENAMES.weekly_memory}`,
    );
  });

  it("updates task-state json with the current task snapshot", async () => {
    const service = new MemoryService();

    const taskState = await service.updateTaskState(
      "org-123",
      "user-456",
      "task-789",
      {
        status: "processing",
        current_node: "load_memory",
      },
    );

    expect(taskState).toMatchObject({
      task_id: "task-789",
      status: "processing",
      current_node: "load_memory",
      updated_at: expect.any(String),
    });
    await expect(
      service.readMemory("org-123", "user-456", "task_state"),
    ).resolves.toMatchObject({
      task_id: "task-789",
      status: "processing",
      current_node: "load_memory",
    });
  });

  it("appends execution reports to short-term memory under the current day", async () => {
    const service = new MemoryService();

    await service.appendShortTermMemoryEntry(
      "org-123",
      "user-456",
      "### 2026-03-20T10:00:00.000Z - Gmail specialist-agent call\n- Status: completed\n",
    );

    const shortTerm = await service.readMemory("org-123", "user-456", "short_term");

    expect(shortTerm).toContain("# Short-Term Memory");
    expect(shortTerm).toContain(`## ${new Date().toISOString().slice(0, 10)}`);
    expect(shortTerm).toContain("Gmail specialist-agent call");
    expect(shortTerm).toContain("Status: completed");
  });

  it("serializes concurrent task-state updates behind a file lock", async () => {
    const service = new MemoryService();
    let releaseFirstWrite: (() => void) | undefined;
    let firstWriteSeen = false;

    vi.mocked(writeFile).mockImplementation(async (filePath, content) => {
      const resolvedPath = String(filePath);

      if (
        !firstWriteSeen &&
        resolvedPath.includes(MEMORY_ARTIFACT_FILENAMES.task_state)
      ) {
        firstWriteSeen = true;
        await new Promise<void>((resolve) => {
          releaseFirstWrite = resolve;
        });
      }

      fileStore.set(resolvedPath, String(content));
    });

    const firstUpdate = service.updateTaskState(
      "org-123",
      "user-456",
      "task-789",
      { current_node: "initialize" },
    );

    while (!firstWriteSeen) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const secondUpdate = service.updateTaskState(
      "org-123",
      "user-456",
      "task-789",
      { status: "processing" },
    );

    const releasePendingWrite: (() => void) | undefined = releaseFirstWrite;
    if (typeof releasePendingWrite === "function") {
      releasePendingWrite();
    }

    await Promise.all([firstUpdate, secondUpdate]);

    await expect(
      service.readMemory("org-123", "user-456", "task_state"),
    ).resolves.toMatchObject({
      task_id: "task-789",
      current_node: "initialize",
      status: "processing",
    });
  });

  it("keeps tenant memory isolated across organizations and users", async () => {
    const service = new MemoryService();

    await service.writeMemory(
      "org-123",
      "user-456",
      "persona",
      "# Persona\n\n- Tenant: A\n",
    );
    await service.writeMemory(
      "org-123",
      "user-999",
      "persona",
      "# Persona\n\n- Tenant: B\n",
    );
    await service.writeMemory(
      "org-999",
      "user-456",
      "persona",
      "# Persona\n\n- Tenant: C\n",
    );

    await expect(
      service.readMemory("org-123", "user-456", "persona"),
    ).resolves.toContain("Tenant: A");
    await expect(
      service.readMemory("org-123", "user-999", "persona"),
    ).resolves.toContain("Tenant: B");
    await expect(
      service.readMemory("org-999", "user-456", "persona"),
    ).resolves.toContain("Tenant: C");
  });

  it("loads the layered memory snapshot for graph injection", async () => {
    const service = new MemoryService();

    fileStore.set(
      `${DEFAULT_MEMORY_ROOT}/org-123/user-456/${MEMORY_ARTIFACT_FILENAMES.short_term}`,
      "# Short-Term Memory\n\n- Draft in progress\n",
    );

    const snapshot = await service.loadMemoryContext("org-123", "user-456");

    expect(snapshot.files.persona).toBe(
      `${DEFAULT_MEMORY_ROOT}/org-123/user-456/${MEMORY_ARTIFACT_FILENAMES.persona}`,
    );
    expect(snapshot.persona).toContain("# Persona");
    expect(snapshot.short_term).toContain("Draft in progress");
    expect(snapshot.weekly_memory).toContain("# Weekly Memory");
    expect(snapshot.long_term).toContain("# Long-Term Memory");
    expect(snapshot.task_state).toEqual({});
  });

  it("loads startup memory without short-term context before task execution continues", async () => {
    const service = new MemoryService();

    fileStore.set(
      `${DEFAULT_MEMORY_ROOT}/org-123/user-456/${MEMORY_ARTIFACT_FILENAMES.short_term}`,
      "# Short-Term Memory\n\n- Should load later\n",
    );

    const snapshot = await service.loadStartupMemoryContext("org-123", "user-456");

    expect(snapshot.persona).toContain("# Persona");
    expect(snapshot.weekly_memory).toContain("# Weekly Memory");
    expect(snapshot.long_term).toContain("# Long-Term Memory");
    expect(snapshot.task_state).toEqual({});
  });

  it("rejects organization or user ids that escape the tenant directory", () => {
    const service = new MemoryService();

    expect(() => service.getOrganizationDirectory("../other-org")).toThrow(
      "Invalid organization id",
    );
    expect(() => service.getUserDirectory("org-123", "../other-user")).toThrow(
      "Invalid user id",
    );
  });
});
