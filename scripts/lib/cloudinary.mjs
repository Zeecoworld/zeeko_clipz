import crypto from 'node:crypto';
import cloudinaryPackage from 'cloudinary';

const cloudinary = cloudinaryPackage.v2;

export const slug = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

// Uploads one finished video to Cloudinary and returns its public link.
export const uploadVideo = async ({file, name, cloudName, apiKey, apiSecret}) => {
  cloudinary.config({cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true});
  const id = `clip-studio/factory/${new Date().toISOString().slice(0, 10)}-${slug(name)}-${crypto.randomBytes(3).toString('hex')}`;
  const result = await cloudinary.uploader.upload(file, {resource_type: 'video', public_id: id, overwrite: false, timeout: 180000});
  return {url: result.secure_url, publicId: result.public_id, seconds: Number(result.duration) || null};
};
