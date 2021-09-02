import React from "react";

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
    music_tags_idx: Map<number, Tags>;
    embeddings: Map<number, Vector>;
    fuse_document: IndexedMusic[];

    constructor(musics: number[], tags: Tag[], users: User[]) {
        this.musics = musics;
        this.tags = tags;
        this.users = users;
        this.music_tags_idx = new Map();
        this.embeddings = new Map();
        this.fuse_document = [];

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

export const MetadataCtx = React.createContext<[MusidexMetadata, () => void]>([emptyMetadata(), () => {
    return;
}]);

export function emptyMetadata(): MusidexMetadata {
    return new MusidexMetadata([], [], []);
}

export function canPlay(tags: Tags): boolean {
    for (let key of tags.keys()) {
        if (key.startsWith("local_")) {
            return true;
        }
    }
    return false;
}

export function dot(v1v: Vector, v2v: Vector): number {
    let v1 = v1v.v;
    let v2 = v2v.v;
    let d = 0;
    for (let i = 0; i < v1.length && i < v2.length; i++) {
        // @ts-ignore
        d += v1[i] * v2[i];
    }
    return d;
}