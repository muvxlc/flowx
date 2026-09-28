import type {
  ImportInput,
  ReferenceAsset,
  ImportConfig
} from '../../src/import/types.ts';

// Conservative mock reference images
export const sampleRefA: ReferenceAsset = {
  id: 'ref_sample_01',
  name: 'portrait_cyber_01.png',
  mimeType: 'image/png',
  sizeBytes: 1024 * 512, // 512 KB
  lastModified: 1774780000000,
};

export const sampleRefB: ReferenceAsset = {
  id: 'ref_sample_02',
  name: 'cyber_car_02.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: 1024 * 768, // 768 KB
  lastModified: 1774780001000,
};

export const sampleRefC: ReferenceAsset = {
  id: 'ref_sample_03',
  name: 'scenery_temple_03.webp',
  mimeType: 'image/webp',
  sizeBytes: 1024 * 256, // 256 KB
  lastModified: 1774780002000,
};

export const oversizedRef: ReferenceAsset = {
  id: 'ref_oversized',
  name: 'giant_raw_texture.png',
  mimeType: 'image/png',
  sizeBytes: 15 * 1024 * 1024, // 15 MB (> default 10MB conservative limit)
  lastModified: 1774780003000,
};

export const unsupportedMimeRef: ReferenceAsset = {
  id: 'ref_bad_mime',
  name: 'vector_graphic.svg',
  mimeType: 'image/svg+xml',
  sizeBytes: 1024 * 64,
  lastModified: 1774780004000,
};

// Mixed Thai and English Prompts
export const thaiEnglishPromptText = [
  'ป่าสนเมืองหนาวหมอกยามเช้า แสงแดดสีทองส่องลอดเงาไม้ สไตล์ภาพถ่ายสมจริง 8k',
  'Nordic pine forest shrouded in dense morning mist, golden hour rim light, HDR',
  'วัดไทยโบราณริมแม่น้ำเจ้าพระยาช่วงพลบค่ำ แสงสะท้อนผิวน้ำระยิบระยับ',
  'A vintage brass telescope pointing at lunar craters inside a Victorian observatory'
].join('\n');

export const thaiEnglishPrompts = [
  'ป่าสนเมืองหนาวหมอกยามเช้า แสงแดดสีทองส่องลอดเงาไม้ สไตล์ภาพถ่ายสมจริง 8k',
  'Nordic pine forest shrouded in dense morning mist, golden hour rim light, HDR',
  'วัดไทยโบราณริมแม่น้ำเจ้าพระยาช่วงพลบค่ำ แสงสะท้อนผิวน้ำระยิบระยับ',
  'A vintage brass telescope pointing at lunar craters inside a Victorian observatory'
];

// Six Generation Mode Fixtures (M1 - M6)
export const fixtureM1_ImageTextOnly: ImportInput = {
  media: 'image',
  mode: 'text-only',
  promptSource: {
    type: 'paste',
    rawText: thaiEnglishPromptText,
  },
  references: [],
};

export const fixtureM2_ImageSingleRef: ImportInput = {
  media: 'image',
  mode: 'single-ref',
  promptSource: {
    type: 'file',
    fileName: 'prompts_image_singleref.txt',
    rawText: thaiEnglishPromptText,
  },
  references: [sampleRefA],
};

export const fixtureM3_ImagePairedRef: ImportInput = {
  media: 'image',
  mode: 'paired-ref',
  promptSource: {
    type: 'paste',
    rawText: [
      'Portrait of cyberpunk engineer in neon alley',
      'Futuristic hover car gliding over illuminated highway',
      'Ancient temple surrounded by holographic lotus flowers'
    ].join('\r\n'),
  },
  references: [sampleRefA, sampleRefB, sampleRefC],
};

export const fixtureM4_VideoTextOnly: ImportInput = {
  media: 'video',
  mode: 'text-only',
  promptSource: {
    type: 'paste',
    rawText: [
      'Cinematic slow camera pan over misty mountain ridge at dawn',
      'Timelapse of bustling neon city with flying vehicles in heavy rain'
    ].join('\n'),
  },
  references: [],
};

export const fixtureM5_VideoSingleRef: ImportInput = {
  media: 'video',
  mode: 'single-ref',
  promptSource: {
    type: 'file',
    fileName: 'prompts_video_singleref.txt',
    rawText: [
      'Gentle camera zoom in on character eyes as neon lights flicker',
      'Wind blowing hair gently with soft bokeh particle simulation'
    ].join('\n'),
  },
  references: [sampleRefA],
};

export const fixtureM6_VideoPairedRef: ImportInput = {
  media: 'video',
  mode: 'paired-ref',
  promptSource: {
    type: 'paste',
    rawText: [
      'Animate portrait turning head towards camera with subtle smile',
      'Vehicle engines ignition with blue exhaust trails accelerating into distance',
      'Temple bells gently swinging in evening breeze with glowing river reflection'
    ].join('\n'),
  },
  references: [sampleRefA, sampleRefB, sampleRefC],
};
