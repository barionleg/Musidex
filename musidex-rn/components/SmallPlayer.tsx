import React, {useContext, useEffect, useState} from "react";
import Ctx from "../domain/ctx";
import {StyleSheet, TouchableOpacity, View} from "react-native";
import {TextBg, TextFg, TextFgGray} from "./StyledText";
import {Icon} from "react-native-elements";
import {getTags} from "../common/entity";
import Thumbnail from "./Thumbnail";
import {isThumbSynced} from "../domain/sync";
import TrackPlayer, {useTrackPlayerProgress} from "react-native-track-player";
import Colors from "../domain/colors";
import Slider from "@react-native-community/slider";
import {timeFormat, useUpdate} from "../common/utils";

interface PlayerProps {
}

function useTrackProgress(interval: number): [number, number] {
    const [position, setPosition] = useState(0);
    const [duration, setDuration] = useState(0);
    useEffect(() => {
        let timeout: any = undefined;
        const f = () => {
            TrackPlayer.getPosition().then((v) => {
                setPosition(v);
            });
            TrackPlayer.getDuration().then((v) => {
                setDuration(v);
            });
            timeout = setTimeout(f, interval);
        };
        f();
        return () => {
            if(timeout) {
                clearTimeout(timeout);
            }
        }
    }, [setPosition, setDuration])
    return [position, duration];
}

let seekID = 0;

const SmallPlayer = (_: PlayerProps) => {
    const [metadata] = useContext(Ctx.Metadata);
    const [doNext, doPrev, reset] = useContext(Ctx.Controls);
    const [player, dispatch] = useContext(Ctx.Trackplayer);
    const list = useContext(Ctx.Tracklist);
    const syncState = useContext(Ctx.SyncState);
    const [open, setOpen] = useState(false);

    const curTrack = list.last_played[list.last_played.length - 1];
    const tags = getTags(metadata, curTrack);
    const title = (tags !== undefined) ? (tags.get("title")?.text || "No Title") : "";
    const artist = (tags !== undefined) ? (tags.get("artist")?.text || "Unknown Artist") : "";

    const canPrev = list.last_played.length > 1;
    const canReset = list.last_played.length > 0;

    const [seekCur, setSeekCur] = useState<number | undefined>(undefined);
    let [position, duration] = useTrackProgress(1000);

    const onPlay = () => {
        if (list.last_played.length > 0) {
            doNext(curTrack);
            return;
        }
        setTimeout(() => doNext(), 0);
    };

    const onForward = () => {
        TrackPlayer.getPosition().then((v) => TrackPlayer.seekTo(v + 10))
    };
    const onBackward = () => {
        TrackPlayer.getPosition().then((v) => TrackPlayer.seekTo(v - 10))
    };

    const onReset = () => {
        dispatch({action: "reset"});
        reset();
    };

    const onSeek = (v: number) => {
        seekID += 1;
        const localSeek = seekID;
        setSeekCur(v);
        setTimeout(() => {
            if (seekID == localSeek) {
                TrackPlayer.seekTo(v).then(() => setTimeout(() => {
                    if (seekID == localSeek) {
                        setSeekCur(undefined)
                    }
                }, 3000));
            }
        }, 300);
    };

    return (
        <View style={[styles.container]}>
            <View style={styles.upperControl}>
                <View style={styles.currentTrack}>
                    <Thumbnail tags={tags} local={isThumbSynced(syncState, metadata, curTrack)}/>
                    <View style={styles.currentTrackTitle}>
                        <TextFg numberOfLines={2}>{title}</TextFg>
                        <TextFgGray numberOfLines={1}>{artist}</TextFgGray>
                    </View>
                </View>
                <View style={styles.controls}>
                    {!open &&
                    <>
                        <TouchableOpacity onPress={onForward}>
                            <Icon size={32}
                                  color="white"
                                  name="forward-10"/>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={onPlay}>
                            <Icon size={37}
                                  color="white"
                                  name={player.paused ? "play-circle-fill" : "pause"}/>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setTimeout(() => doNext(), 0)}>
                            <Icon size={32}
                                  color="white"
                                  name="skip-next"/>
                        </TouchableOpacity>
                    </>}
                    {open &&
                    <>
                        <TextBg>{timeFormat(position)}/{timeFormat(duration)}</TextBg>
                    </>}
                    <TouchableOpacity onPress={() => setOpen(!open)}>
                        <Icon size={32}
                              color="white"
                              name={open ? "expand-more" : "expand-less"}/>
                    </TouchableOpacity>
                </View>
            </View>
            {open &&
            <View style={styles.lowerControls}>
                <View style={styles.lowerButtons}>
                    <TouchableOpacity onPress={onReset} disabled={!canReset}>
                        <Icon size={30}
                              color={canReset ? "white" : "gray"}
                              name="clear"/>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={doPrev} disabled={!canPrev}>
                        <Icon size={32}
                              color={canPrev ? "white" : "gray"}
                              name="skip-previous"/>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onBackward}>
                        <Icon size={28}
                              color="white"
                              name="replay-10"/>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onPlay}>
                        <Icon size={32}
                              color="white"
                              name={player.paused ? "play-circle-fill" : "pause"}/>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onForward}>
                        <Icon size={28}
                              color="white"
                              name="forward-10"/>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setTimeout(() => doNext(), 0)}>
                        <Icon size={32}
                              color="white"
                              name="skip-next"/>
                    </TouchableOpacity>
                    <View style={{flexBasis: 30}}/>
                </View>
                <View style={styles.temperatureContainer}>
                    <Slider style={styles.temperatureSlider}
                            minimumTrackTintColor={Colors.primary}
                            thumbTintColor={Colors.colorfg}
                            tapToSeek={true}
                            maximumTrackTintColor={Colors.colorbg}
                            value={seekCur ?? position} minimumValue={0} maximumValue={duration}
                            onValueChange={onSeek}/>
                </View>
            </View>}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexGrow: 0,
        display: "flex",
        flexDirection: "column",
    },
    temperatureSlider: {},
    temperatureContainer: {
        flexGrow: 1,
        justifyContent: "center",
    },
    upperControl: {
        flexBasis: 60,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    lowerControls: {
        flexBasis: 80,
    },
    lowerButtons: {
        display: "flex",
        flexDirection: "row",
        justifyContent: "space-around",
        alignItems: "center",
        paddingHorizontal: 30,
        flexGrow: 0,
        flexShrink: 10,
    },
    currentTrack: {
        flexDirection: "row",
        alignItems: "center",
        flex: 1,
    },
    currentTrackTitle: {
        padding: 5,
        flex: 1,
    },
    trackInfo: {},
    controls: {
        flexGrow: 0,
        flexDirection: "row",
        justifyContent: "flex-end",
        alignItems: "center",
        paddingRight: 10,
    },
});

export default SmallPlayer;
