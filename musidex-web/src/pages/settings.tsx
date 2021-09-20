import './settings.css'
import {PageProps} from "./navigator";
import React, {useContext, useState} from "react";
import TextInput from "../components/input";
import API from "../common/api";
import {MetadataCtx} from "../domain/metadata";
import {MaterialIcon, useDebouncedEffect} from "../components/utils";

const SettingsPage = (props: PageProps) => {
    let [metadata, metadataSync] = useContext(MetadataCtx);
    let [restartStatus, setRestartStatus] = useState("restart_alt");

    useDebouncedEffect(() => {
        if (restartStatus !== "pending") {
            setRestartStatus("restart_alt")
        }
    }, [restartStatus], 3000);

    let onRestartServer = () => {
        setRestartStatus("pending");
        API.restartServer().then((res) => {
                if (!res.ok) {
                    setRestartStatus("error");
                } else {
                    setRestartStatus("check");
                }
            }
        );
    };

    return (
        <div className={"scrollable-element content" + (props.hidden ? " hidden" : "")}>
            <div className="settings color-fg ">
                <div className="title">
                    Settings
                </div>
                <div style={{marginTop: 10}}>
                    <button className="navbar-button" onClick={onRestartServer}>
                        <MaterialIcon name={restartStatus}
                                      size={25}/>&nbsp;Restart
                        server
                    </button>
                </div>
                {
                    metadata.settings_l.slice(0, 0).map(([key, value]) => {
                        return <SettingsElem sync={metadataSync} key={key} setting_key={key} value={value}/>;
                    })
                }
            </div>
        </div>
    )
}

type SettingsElemProps = {
    setting_key: string;
    value: string;
    sync: () => void;
}

const SettingsElem = React.memo((props: SettingsElemProps) => {
    return <div className="settings-elem">
        <TextInput name={props.setting_key}
                   withLabel={true}
                   startValue={props.value}
                   onBlur={(v) => {
                       API.updateSettings(props.setting_key, v).then(() => props.sync());
                   }}/>
    </div>;
})

export default SettingsPage;