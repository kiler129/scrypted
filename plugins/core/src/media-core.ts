import { ScryptedDeviceBase, HttpRequestHandler, HttpRequest, HttpResponse, EngineIOHandler, Device, ScryptedInterfaceProperty, DeviceProvider, ScryptedInterface, ScryptedDeviceType, BufferConverter, MediaObject, VideoCamera, Camera, ScryptedMimeTypes, RequestMediaStreamOptions } from '@scrypted/sdk';
import sdk from '@scrypted/sdk';
const { systemManager, deviceManager, mediaManager, endpointManager } = sdk;
import Router from 'router';
import { UserStorage } from './userStorage';
import { RpcPeer } from '../../../server/src/rpc';
import { setupPluginRemote } from '../../../server/src/plugin/plugin-remote';
import { PluginAPIProxy } from '../../../server/src/plugin/plugin-api';
import { UrlConverter } from './converters';
import fs from 'fs';
import { sendJSON } from './http-helpers';
import { Automation } from './automation';
import { AggregateDevice, createAggregateDevice } from './aggregate';
import net from 'net';
import { Script } from './script';
import { addBuiltins } from "../../../common/src/wrtc-convertors";
import { updatePluginsData } from './update-plugins';

export class MediaCore extends ScryptedDeviceBase implements DeviceProvider, BufferConverter {
    httpHost: UrlConverter;
    httpsHost: UrlConverter;

    constructor(nativeId: string) {
        super(nativeId);

        this.fromMimeType = ScryptedMimeTypes.SchemePrefix + 'scrypted-media';
        this.toMimeType = ScryptedMimeTypes.MediaObject;

        (async () => {
            await deviceManager.onDevicesChanged({
                providerNativeId: this.nativeId,
                devices: [
                    {
                        name: 'HTTP file host',
                        nativeId: 'http',
                        interfaces: [ScryptedInterface.BufferConverter, ScryptedInterface.HttpRequestHandler],
                        type: ScryptedDeviceType.API,
                    },
                    {
                        providerNativeId: this.nativeId,
                        name: 'HTTPS file host',
                        nativeId: 'https',
                        interfaces: [ScryptedInterface.BufferConverter, ScryptedInterface.HttpRequestHandler],
                        type: ScryptedDeviceType.API,
                    }
                ]
            })
            this.httpHost = new UrlConverter(false);
            this.httpsHost = new UrlConverter(true);
        })();
    }

    async convert(data: string, fromMimeType: string, toMimeType: string): Promise<MediaObject> {
        const url = new URL(data.toString());
        const id = url.hostname;
        const path = url.pathname.split('/')[1];
        if (path === ScryptedInterface.VideoCamera) {
            const camera = systemManager.getDeviceById<VideoCamera>(id);
            if (toMimeType === ScryptedMimeTypes.RTCAVSignalingOfferSetup) {
                const msos = await camera.getVideoStreamOptions();
                const found = msos.find(mso => mso.container?.startsWith(ScryptedMimeTypes.RTCAVSignalingPrefix)) as RequestMediaStreamOptions;
                if (found) {
                    found.directMediaStream = true;
                    const mo = await camera.getVideoStream(found);
                    const buffer = await mediaManager.convertMediaObjectToBuffer(mo, mo.mimeType);
                    return mediaManager.createMediaObject(buffer, ScryptedMimeTypes.RTCAVSignalingOfferSetup);
                }
            }
            return camera.getVideoStream();
        }
        else if (path === ScryptedInterface.Camera) {
            return await systemManager.getDeviceById<Camera>(id).takePicture() as any;
        }
        else {
            throw new Error('Unrecognized Scrypted Media interface.')
        }
    }

    getDevice(nativeId: string) {
        if (nativeId === 'http')
            return this.httpHost;
        if (nativeId === 'https')
            return this.httpsHost;
    }
}