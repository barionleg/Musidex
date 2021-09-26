import {retain} from "./utils";
import {RawMusidexMetadata} from "./api";

export interface Tag {
    music_id: number;
    key: string;

    text?: string;
    integer?: number;
    date?: string;
    vector?: number[];
}

export type User = {
    id: number;
    name: string;
}

export type Tags = Map<string, Tag>;
export type Vector = {
    v: number[],
    mag: number,
};

export type IndexedMusic = {
    id: number;
    title: string;
    artist: string;
}

export class MusidexMetadata {
    musics: number[];
    tags: Tag[];
    users: User[];
    settings_l: [string, string][];
    music_tags_idx: Map<number, Tags>;
    settings: Map<string, string>;
    embeddings: Map<number, Vector>;
    fuse_document: IndexedMusic[];

    getTags(id: number | undefined): Tags | undefined {
        if (id === undefined) {
            return undefined;
        }
        return this.music_tags_idx.get(id);
    }

    firstUser(): number | undefined {
        return this.users[0]?.id;
    }

    constructor(raw: RawMusidexMetadata, previous?: MusidexMetadata) {
        this.musics = raw.musics;
        this.users = raw.users;
        this.settings_l = raw.settings;
        this.settings = new Map(raw.settings);
        this.music_tags_idx = new Map();
        this.embeddings = new Map();
        this.fuse_document = [];
        this.tags = raw.tags || previous?.tags || [];

        if (raw.patches) {
            for (let patch of raw.patches) {
                switch (patch.kind) {
                    case "add":
                        this.tags.push(patch.tag);
                        break
                    case "remove":
                        let id = patch.id;
                        let k = patch.key;
                        retain(this.tags, (t) => t.music_id !== id && t.key !== k)
                        break
                    case "update":
                        for (let i = 0; i < this.tags.length; i++) {
                            let v = this.tags[i];
                            // @ts-ignore
                            if (v.music_id === patch.tag.music_id && v.key === patch.tag.key) {
                                this.tags[i] = patch.tag;
                            }
                        }
                        break
                }
            }
        }

        this.musics.forEach((m) => {
            this.music_tags_idx.set(m, new Map());
        })

        this.tags.forEach((tag) => {
            this.music_tags_idx.get(tag.music_id)?.set(tag.key, tag);
            if (tag.key === "embedding" && tag.vector !== undefined) {
                let mag = 0;
                for (let v of tag.vector) {
                    mag += v * v;
                }
                mag = Math.sqrt(mag);
                this.embeddings.set(tag.music_id, {v: tag.vector, mag: mag});
            }
        })

        for (let [id, tags] of this.music_tags_idx.entries()) {
            this.fuse_document.push({
                id: id,
                title: tags.get("title")?.text || "",
                artist: tags.get("artist")?.text || "",
            })
        }
    }
}

export function emptyMetadata(): MusidexMetadata {
    return new MusidexMetadata({musics: [], users: [], tags: [], settings: []});
}

export function canPlay(tags: Tags): boolean {
    for (let key of tags.keys()) {
        if (key.startsWith("local_")) {
            return true;
        }
    }
    return false;
}