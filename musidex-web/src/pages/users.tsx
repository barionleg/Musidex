import './users.css'
import React, {useContext, useMemo, useState} from "react";
import {User} from "../common/entity";
import {Page, PageProps} from "./navigator";
import {EditableText, MaterialIcon} from "../components/utils";
import TextInput from "../components/input";
import API from "../common/api";
import {MetadataCtx} from "../domain/metadata";
import {Setter} from "../../../musidex-ts-common/utils";
import {SearchFormCtx} from "../App";
import {timeFormatHour} from "../common/utils";

export interface UsersProps extends PageProps {
    onSetUser: (id: number) => void;
    curUser?: number;
    page: Page,
    setCurPage: Setter<Page>;
}

const Users = (props: UsersProps) => {
    const [meta, metaSync] = useContext(MetadataCtx);
    const [sform, setSform] = useContext(SearchFormCtx);
    const [newName, setNewName] = useState("");

    const userTime = useMemo(() => {
        let userTime = new Map();
        for (const [uid, songs] of meta.user_songs.entries()) {
            for (const song of songs) {
                const dur = meta.music_tags_idx.get(song)?.get("duration")?.integer;
                if (dur) {
                    userTime.set(uid, (userTime.get(uid) || 0) + dur);
                }
            }
        }
        return userTime;
    }, [meta]);

    const onDelete = (id: number) => {
        API.deleteUser(id).then(() => metaSync());
    };

    const onRename = (id: number, newName: string) => {
        API.renameUser(id, newName).then(() => metaSync());
    };

    const onNewSubmit = () => {
        if (newName === "") {
            return;
        }
        API.createUser(newName).then(() => metaSync());
        setNewName("");
    };

    const onSelectUser = (user: number) => {
        props.onSetUser(user);
        props.setCurPage({...props.page, path: "explorer"});
        setSform({
            ...sform,
            filters: {
                ...sform.filters,
                user: user,
            }
        })
    };

    return (
        <>
            <div className={"users color-fg " + (props.hidden ? " hidden" : "")}>
                {
                    meta.users.map((user) => {
                        return <UserCard key={user.id}
                                         user={user}
                                         nSongs={meta.user_songs.get(user.id)?.length || 0}
                                         timeSongs={userTime.get(user.id) || 0}
                                         isCurrent={props.curUser === user.id}
                                         onSelect={onSelectUser}
                                         onDelete={onDelete}
                                         onRename={onRename}/>;
                    })
                }
            </div>
            <div className={"user-add" + (props.hidden ? " hidden" : "")}>
                <b>Create user</b>
                <TextInput onChange={setNewName} value={newName} withLabel={true} name="User Name" title="User Name"/>
                <div className="user-add-submit" onClick={onNewSubmit}>Submit</div>
            </div>
        </>
    )
}

type UserCardProps = {
    user: User;
    nSongs: number;
    timeSongs: number;
    onSelect: (id: number) => void;
    onDelete: (id: number) => void;
    onRename: (id: number, newName: string) => void;
    isCurrent: boolean;
}

const UserCard = (props: UserCardProps) => {
    return <div className={"user-card " + (props.isCurrent ? " user-card-current" : "")}
                onClick={() => props.onSelect(props.user.id)}
    >
        <div className="user-card-info">
            <div>
                {props.nSongs} songs
            </div>
            <div title="Total playtime">
                {timeFormatHour(props.timeSongs)}
            </div>
        </div>
        <div className="user-card-name">
            <EditableText text={props.user.name} onRename={(v) => props.onRename(props.user.id, v)}/>
        </div>
        <div className="user-card-delete">
            <MaterialIcon name="delete" onClick={(e: React.MouseEvent) => {
                props.onDelete(props.user.id);
                e.stopPropagation();
            }} size={20}/>
        </div>
    </div>;
}

export default Users;