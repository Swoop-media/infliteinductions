# Course video compression — 2026-08-12

All 34 course videos over 100 MB in the `course-files` bucket (`module-videos/`) were re-encoded with ffmpeg (H.264, max 1080p, CRF 23, AAC 128k, +faststart) and replaced in place. 32 were replaced; 2 were already efficiently encoded (re-encode came out larger) and were left untouched.

Note: `.../7fc311db-.../ef206b63-....webm` was re-encoded to MP4 bytes and subsequently migrated to a `.mp4` path (no content blocks referenced it).

| # | File | Before (MB) | After (MB) | Status |
|---|------|------------:|-----------:|--------|
| 1 | module-videos/bc022ecb-a3f6-4f6c-b184-b170556b48d3/e1e6e8e1-fcf7-4307-b2bf-3ee97e086bd1.mp4 | 1821.3 | 506.4 | replaced |
| 2 | module-videos/bc022ecb-a3f6-4f6c-b184-b170556b48d3/44dcee59-ba56-423e-84ca-34d7842eb0e3.mp4 | 1531.9 | 468.1 | replaced |
| 3 | module-videos/0d4f6f35-cd65-4171-8a7b-b0e81ecd2ac1/aaa6f186-80dd-42b0-bd37-845df1de10df.mp4 | 1327.0 | 139.4 | replaced |
| 4 | module-videos/bcd69d7d-34ac-4e61-a630-d9b525c60852/59f644e9-cf85-4880-8461-5330c27c6b09.mp4 | 779.7 | 249.1 | replaced |
| 5 | module-videos/34a9610b-cd67-4ff4-ac54-19b34b874d78/e6ce995a-9447-4d81-b9ac-325b664b28a9.mp4 | 709.5 | 193.3 | replaced |
| 6 | module-videos/a561f5f7-94ae-4281-9182-7bef3a99870a/4bf65e83-ce9d-4c35-844a-c11918d1bd74.mp4 | 606.0 | 181.8 | replaced |
| 7 | module-videos/f2e3e35c-2f2b-485c-b7c5-245043204e59/2f866d78-d0f5-4594-a1a4-5be0c420f717.mp4 | 538.2 | 212.9 | replaced |
| 8 | module-videos/f2e3e35c-2f2b-485c-b7c5-245043204e59/f292ed3a-1d0f-4603-b601-16fb9bab9378.mp4 | 538.2 | 212.9 | replaced |
| 9 | module-videos/1b5b2840-941d-4b6c-b847-feaa25a5731b/c7a31d05-44fa-4ad0-a7f9-530a9e5f4d55.mp4 | 473.2 | 397.1 | replaced |
| 10 | module-videos/24c984ef-381e-411b-a6fc-2fc2bc76a4e8/6d338fdc-4ac4-45bc-8c69-a506d31af4af.mp4 | 471.0 | 165.0 | replaced |
| 11 | module-videos/540cc325-f5b3-4b26-803d-b8ee320dc6fa/c90292dc-c1b9-4903-86e5-176e453805eb.mp4 | 433.9 | 85.6 | replaced |
| 12 | module-videos/5fb3338a-96fe-40b7-911f-02be3575d90e/16851717-d7e1-4bba-9c13-b3a92b25c10b.mp4 | 404.1 | 129.6 | replaced |
| 13 | module-videos/e733ee5d-21c3-45b3-934d-2d527a5a113d/3fdff78b-03b9-457a-861b-e9aceec018d9.mp4 | 372.1 | 88.4 | replaced |
| 14 | module-videos/ff98ac81-d089-4187-b481-9f1935b32c8b/bb3992b0-1b37-4901-bf34-aa72137046f8.mp4 | 344.3 | 167.9 | replaced |
| 15 | module-videos/6579cc55-df15-4e69-8fe8-5472da4f38aa/5d3fc6ed-99ed-4bb6-94f3-a6fef6e8eb08.mp4 | 344.3 | 109.4 | replaced |
| 16 | module-videos/6579cc55-df15-4e69-8fe8-5472da4f38aa/5dbb1d73-f2f7-4090-a320-a45e74eaef45.mp4 | 344.3 | 109.4 | replaced |
| 17 | module-videos/1b5b2840-941d-4b6c-b847-feaa25a5731b/d94bdceb-7286-4656-b649-2fdf413c59d9.mp4 | 335.4 | 255.8 | replaced |
| 18 | module-videos/b152f39d-b5ee-4a68-a8de-8d60117cd241/aae7cb8b-3ff8-4e03-9caa-d2d45b4298a7.mov | 324.1 | 28.3 | replaced |
| 19 | module-videos/b152f39d-b5ee-4a68-a8de-8d60117cd241/cfee94c9-fe2d-457d-bed4-2e8bcdc38f4c.mp4 | 308.1 | 28.3 | replaced |
| 20 | module-videos/6bcfb639-8b36-4cd9-8923-9f360bc40612/bcd870c7-73a4-4228-a380-34c368886548.mp4 | 294.1 | 57.0 | replaced |
| 21 | module-videos/a3fd5acb-6db4-4927-92be-42bbf1270cc4/44d15c30-4015-45df-bac7-68471e1060c5.mp4 | 280.1 | 127.2 | replaced |
| 22 | module-videos/1b5b2840-941d-4b6c-b847-feaa25a5731b/515785b7-a206-4a0a-a61e-821d0756ffe6.mp4 | 273.4 | 207.8 | replaced |
| 23 | module-videos/1b5b2840-941d-4b6c-b847-feaa25a5731b/d60c892c-b0b8-41b9-ae06-8c79b1c7efa1.mp4 | 273.4 | 207.8 | replaced |
| 24 | module-videos/f2f41402-bfb1-40dc-a984-2594fd637bcc/bbe8915f-ea9b-4338-8cae-6c917c30226e.mp4 | 168.7 | 32.8 | replaced |
| 25 | module-videos/7fc311db-1555-4eef-8eb2-6bc00b9c8a48/edc62126-a5f7-4655-a2ac-e90d5909838e.mp4 | 166.2 | 33.9 | replaced |
| 26 | module-videos/7fc311db-1555-4eef-8eb2-6bc00b9c8a48/ef206b63-4ca4-485d-a05c-6f8c0be94cd6.webm | 162.1 | 33.7 | replaced |
| 27 | module-videos/e3ba9108-9a8f-4642-8992-6f5595232d26/2ccf4293-5a4c-41a8-a29c-c50dd4cf5ee3.mp4 | 145.7 | 110.0 | replaced |
| 28 | module-videos/c0afdad5-c4a4-4c32-91de-bb49f35f359f/e8fa5cd5-dea2-4f96-a5a9-518c3b36fae9.mp4 | 137.1 | 84.2 | replaced |
| 29 | module-videos/1f14c1a5-9ff0-42a1-9527-e7ba70846b39/ef14a2e2-cf71-41c6-9448-fd6e0a6abda5.mp4 | 128.3 | 22.0 | replaced |
| 30 | module-videos/54224b50-ff8d-4711-a5fe-d1a28e6a4f14/8a7f3680-5881-4f75-8fd0-84e68d4c0db3.mp4 | 124.2 | 25.3 | replaced |
| 31 | module-videos/54224b50-ff8d-4711-a5fe-d1a28e6a4f14/fe6c7ad2-8f28-4e11-801c-f1d6cb16088d.mp4 | 124.2 | 25.3 | replaced |
| 32 | module-videos/f8a25135-e2bb-4b66-8fbd-c1e61034c4a1/95e44d62-3ba8-40b9-a424-4e6ac6405cbf.mp4 | 124.0 | 23.0 | replaced |
| 33 | module-videos/8f0725b2-06eb-4c93-84b3-4781c099ba66/7b2b6c32-5359-4671-bd2c-a6d4eeac1c8d.mp4 | 122.4 | 122.4 | skipped-not-smaller |
| 34 | module-videos/8f0725b2-06eb-4c93-84b3-4781c099ba66/981b7c1c-5bc5-4a8a-abcb-f91a6748d3b8.mp4 | 122.4 | 122.4 | skipped-not-smaller |

**Totals:** 34 files; replaced 32; before 14.65 GB, after 4.96 GB.
