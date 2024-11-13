import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: process.env.NEXT_PUBLIC_S3_REGION,
  credentials: {
    accessKeyId: process.env.NEXT_PUBLIC_S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.NEXT_PUBLIC_S3_SECRET_ACCESS_KEY!,
  },
});

export async function uploadToS3(file: File) {
  try {
    const file_key =
      "uploads/" + Date.now().toString() + file.name.replace(" ", "-");

    const params = {
      Bucket: process.env.NEXT_PUBLIC_S3_BUCKET_NAME!,
      Key: file_key,
      Body: file,
    };

    const command = new PutObjectCommand(params);

    // The progress tracking part for AWS SDK v3 requires more custom handling
    const response = await s3Client.send(command);
    console.log("Successfully uploaded to S3!", file_key);
    console.log("response", response);

    return Promise.resolve({
      file_key,
      file_name: file.name,
    });
  } catch (err) {
    console.error("Error uploading file:", err);
    return null;
  }
}

export function getS3Url(file_key: string) {
  return `https://${process.env.NEXT_PUBLIC_S3_BUCKET_NAME}.s3.${process.env.NEXT_PUBLIC_S3_REGION}.amazonaws.com/${file_key}`;
}
