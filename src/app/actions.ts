"use server";

import { r2 } from "@/lib/r2";
import {
    ListBucketsCommand,
    ListObjectsV2Command,
    DeleteObjectCommand,
    PutObjectCommand,
    GetObjectCommand,
    CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface Bucket {
    Name: string;
    CreationDate: string;
}

export interface R2Object {
    Key: string;
    Size: number;
    LastModified: string;
    Url?: string;
}

export async function listBuckets(): Promise<{ success: boolean; buckets?: Bucket[]; error?: string }> {
    try {
        const data = await r2.send(new ListBucketsCommand({}));
        return {
            success: true,
            buckets: data.Buckets?.map(b => ({
                Name: b.Name || "Unknown",
                CreationDate: b.CreationDate?.toISOString() || ""
            })) || []
        };
    } catch (error: any) {
        console.error("Error listing buckets:", error);
        return { success: false, error: error.message };
    }
}

export interface R2Folder {
    Prefix: string;
    Name: string;
}

export async function listFiles(bucketName: string, prefix: string = ""): Promise<{ success: boolean; files?: R2Object[]; folders?: R2Folder[]; error?: string }> {
    try {
        const command = new ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: prefix,
            Delimiter: "/"
        });

        const data = await r2.send(command);

        const files: R2Object[] = data.Contents?.filter(obj => obj.Key !== prefix).map(obj => ({
            Key: obj.Key || "Unknown",
            Size: obj.Size || 0,
            LastModified: obj.LastModified?.toISOString() || "",
        })) || [];

        const folders: R2Folder[] = data.CommonPrefixes?.map(cp => ({
            Prefix: cp.Prefix || "",
            Name: cp.Prefix?.split('/').filter(Boolean).pop() || "Unknown"
        })) || [];

        return { success: true, files, folders };
    } catch (error: any) {
        console.error(`Error listing files in ${bucketName}:`, error);
        return { success: false, error: error.message };
    }
}

export async function deleteFile(bucketName: string, key: string) {
    try {
        await r2.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function copyFile(bucketName: string, sourceKey: string, destinationKey: string, isMove = false) {
    try {
        // Copy
        await r2.send(new CopyObjectCommand({
            Bucket: bucketName,
            CopySource: `${bucketName}/${encodeURIComponent(sourceKey)}`, // Source must be url encoded (except slash for some providers depending on standard, but usually raw path) - for S3 it often needs bucket/key
            Key: destinationKey,
        }));

        // If Move, delete original
        if (isMove) {
            await r2.send(new DeleteObjectCommand({
                Bucket: bucketName,
                Key: sourceKey
            }));
        }

        return { success: true };
    } catch (error: any) {
        console.error("Copy/Move error:", error);
        return { success: false, error: error.message };
    }
}

export async function getUploadUrl(bucketName: string, key: string, contentType: string) {
    try {
        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            ContentType: contentType,
        });
        const url = await getSignedUrl(r2, command, { expiresIn: 3600 });
        return { success: true, url };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getObjectUrl(bucketName: string, key: string) {
    try {
        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: key,
        });
        // Link valid for 1 hour
        const url = await getSignedUrl(r2, command, { expiresIn: 3600 });
        return { success: true, url };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
