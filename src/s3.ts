import S3 from 'aws-sdk/clients/s3';
import fs from 'fs';
import internal from 'stream';

const s3 = new S3({
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

export function getFile(fileName: string): internal.Readable {
    const params = {
        Bucket: process.env.AWS_BUCKET_NAME || "",
        Key: fileName
    };
    return s3.getObject(params).createReadStream();
}

export function uploadFile(file: any): Promise<S3.ManagedUpload.SendData> {
    const fileStream: fs.ReadStream = fs.createReadStream(file.path);
    const uploadParams = {
        Bucket: process.env.AWS_BUCKET_NAME || "",
        Body: fileStream,
        Key: file.filename
    }
    return s3.upload(uploadParams).promise();
}

export async function deleteFile(url: string): Promise<void> {
    const fileName: string = url.split("/")[3];
    await s3.deleteObject({
        Bucket: process.env.AWS_BUCKET_NAME || "",
        Key: fileName
    }).promise();
}
