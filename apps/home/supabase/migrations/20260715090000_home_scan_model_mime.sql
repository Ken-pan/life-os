-- HomeScan「真实空间模式」:扫描的 USDZ 3D 模型也存进 home-scan-photos 桶
-- ({uid}/{scanId}/model.usdz)。全屋带家具网格通常 5-15 MiB,上限放宽到 50 MiB。
update storage.buckets
set
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'application/json',
    'model/vnd.usdz+zip'
  ],
  file_size_limit = 52428800 -- 50 MiB
where id = 'home-scan-photos';
