import * as fs from 'fs';
import * as path from 'path';

export interface SkillMetadata {
  name: string;
  description: string;
}

export interface Skill {
  metadata: SkillMetadata;
  content: string;
  rawContent: string;
  /** Directory name under the skills folder, e.g. "test-driven-development" */
  dirName: string;
}

/**
 * Parses YAML frontmatter from a skill file.
 * Supports simple key: value and key: "quoted value" formats.
 */
function parseFrontmatter(raw: string): { metadata: SkillMetadata; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { metadata: { name: '', description: '' }, content: raw };
  }

  const frontmatterStr = match[1];
  const body = match[2];
  const metadata: Record<string, string> = {};

  for (const line of frontmatterStr.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
      metadata[key] = value;
    }
  }

  return {
    metadata: {
      name: metadata['name'] || '',
      description: metadata['description'] || '',
    },
    content: body,
  };
}

/**
 * SkillRegistry loads and caches skills from a skills directory.
 */
export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();
  private skillsDir: string;
  private loaded = false;

  constructor(skillsDir: string) {
    this.skillsDir = skillsDir;
  }

  /**
   * Lazily loads all skills from the skills directory.
   */
  private load(): void {
    if (this.loaded) return;
    this.loaded = true;

    if (!fs.existsSync(this.skillsDir)) {
      console.error(`[Shane Skills] Skills directory not found: ${this.skillsDir}`);
      return;
    }

    const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillFile = path.join(this.skillsDir, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillFile)) continue;

      try {
        const raw = fs.readFileSync(skillFile, 'utf8');
        const { metadata, content } = parseFrontmatter(raw);

        // Use frontmatter name if available, otherwise use directory name
        const skillName = metadata.name || entry.name;

        this.skills.set(skillName, {
          metadata: { name: skillName, description: metadata.description },
          content,
          rawContent: raw,
          dirName: entry.name,
        });

        // Also index by directory name for lookup flexibility
        if (entry.name !== skillName) {
          this.skills.set(entry.name, {
            metadata: { name: skillName, description: metadata.description },
            content,
            rawContent: raw,
            dirName: entry.name,
          });
        }
      } catch (err) {
        console.error(`[Shane Skills] Failed to load skill ${entry.name}:`, err);
      }
    }
  }

  /**
   * Returns a specific skill by name (exact match or directory name).
   */
  getSkill(name: string): Skill | undefined {
    this.load();
    // Try exact match first
    if (this.skills.has(name)) {
      return this.skills.get(name);
    }
    // Try case-insensitive match
    const lower = name.toLowerCase();
    for (const [key, skill] of this.skills) {
      if (key.toLowerCase() === lower) {
        return skill;
      }
    }
    return undefined;
  }

  /**
   * Returns all skills (deduplicated by canonical name).
   */
  getAllSkills(): Skill[] {
    this.load();
    const seen = new Set<string>();
    const result: Skill[] = [];
    for (const skill of this.skills.values()) {
      if (!seen.has(skill.metadata.name)) {
        seen.add(skill.metadata.name);
        result.push(skill);
      }
    }
    return result;
  }

  /**
   * Invalidates the skill cache so skills are re-read on next access.
   */
  invalidate(): void {
    this.skills.clear();
    this.loaded = false;
  }

  getSkillsDir(): string {
    return this.skillsDir;
  }

}
