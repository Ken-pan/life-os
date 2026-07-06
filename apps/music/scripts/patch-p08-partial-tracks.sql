-- P0.8: manual tag patch for 4 remaining partial tracks (LLM returned sparse/low-confidence tags)
-- User: c2831538-94b0-4a57-b034-5e873a53c42e

do $$
declare
  v_user uuid := 'c2831538-94b0-4a57-b034-5e873a53c42e';
begin
  -- Remove low-confidence LLM tags; keep heuristic quality/version
  delete from music.track_tags
  where user_id = v_user
    and track_id in (
      '341c0f788a7e95ae48a4e3d6980602730d1a37525fd85098310cabc6be35e28f',
      'a3966c8bbdfcd7c6e8ce86c74db337fcc4278c5aca57641f336f01975d29dc7b',
      'e21f8c4a654e70eaca572a3b6b4fcd5771e472094565be4d7857c7f5bb57a882',
      'd04349e2e7e474e4ad81466a3ce8b898c62cc85c0b21f21e02e1f39c50ecbb00'
    )
    and source = 'llm';

  -- 土坡上的狗尾草 — 卢润泽 (mandopop ballad)
  insert into music.track_tags (user_id, track_id, tag_slug, confidence, source, locked) values
    (v_user, '341c0f788a7e95ae48a4e3d6980602730d1a37525fd85098310cabc6be35e28f', 'mandopop', 0.76, 'manual', false),
    (v_user, '341c0f788a7e95ae48a4e3d6980602730d1a37525fd85098310cabc6be35e28f', 'c-pop', 0.74, 'manual', false),
    (v_user, '341c0f788a7e95ae48a4e3d6980602730d1a37525fd85098310cabc6be35e28f', 'pop', 0.72, 'manual', false),
    (v_user, '341c0f788a7e95ae48a4e3d6980602730d1a37525fd85098310cabc6be35e28f', 'sad', 0.78, 'manual', false),
    (v_user, '341c0f788a7e95ae48a4e3d6980602730d1a37525fd85098310cabc6be35e28f', 'soft', 0.76, 'manual', false),
    (v_user, '341c0f788a7e95ae48a4e3d6980602730d1a37525fd85098310cabc6be35e28f', 'cinematic', 0.72, 'manual', false),
    (v_user, '341c0f788a7e95ae48a4e3d6980602730d1a37525fd85098310cabc6be35e28f', 'background', 0.74, 'manual', false),
    (v_user, '341c0f788a7e95ae48a4e3d6980602730d1a37525fd85098310cabc6be35e28f', 'walking', 0.72, 'manual', false),
    (v_user, '341c0f788a7e95ae48a4e3d6980602730d1a37525fd85098310cabc6be35e28f', 'playlist-continue-good', 0.70, 'manual', false),
    (v_user, '341c0f788a7e95ae48a4e3d6980602730d1a37525fd85098310cabc6be35e28f', 'lang-zh', 0.80, 'manual', false)
  on conflict (user_id, track_id, tag_slug, source) do update set confidence = excluded.confidence;

  -- i like the way you kiss me — Artemas (hyperpop viral)
  insert into music.track_tags (user_id, track_id, tag_slug, confidence, source, locked) values
    (v_user, 'a3966c8bbdfcd7c6e8ce86c74db337fcc4278c5aca57641f336f01975d29dc7b', 'hyperpop', 0.78, 'manual', false),
    (v_user, 'a3966c8bbdfcd7c6e8ce86c74db337fcc4278c5aca57641f336f01975d29dc7b', 'electropop', 0.76, 'manual', false),
    (v_user, 'a3966c8bbdfcd7c6e8ce86c74db337fcc4278c5aca57641f336f01975d29dc7b', 'dance-pop', 0.72, 'manual', false),
    (v_user, 'a3966c8bbdfcd7c6e8ce86c74db337fcc4278c5aca57641f336f01975d29dc7b', 'playful', 0.78, 'manual', false),
    (v_user, 'a3966c8bbdfcd7c6e8ce86c74db337fcc4278c5aca57641f336f01975d29dc7b', 'quirky', 0.76, 'manual', false),
    (v_user, 'a3966c8bbdfcd7c6e8ce86c74db337fcc4278c5aca57641f336f01975d29dc7b', 'confident', 0.74, 'manual', false),
    (v_user, 'a3966c8bbdfcd7c6e8ce86c74db337fcc4278c5aca57641f336f01975d29dc7b', 'party', 0.76, 'manual', false),
    (v_user, 'a3966c8bbdfcd7c6e8ce86c74db337fcc4278c5aca57641f336f01975d29dc7b', 'playlist-continue-good', 0.72, 'manual', false),
    (v_user, 'a3966c8bbdfcd7c6e8ce86c74db337fcc4278c5aca57641f336f01975d29dc7b', 'gym', 0.70, 'manual', false),
    (v_user, 'a3966c8bbdfcd7c6e8ce86c74db337fcc4278c5aca57641f336f01975d29dc7b', 'lang-en', 0.80, 'manual', false)
  on conflict (user_id, track_id, tag_slug, source) do update set confidence = excluded.confidence;

  -- 唯一 — G.E.M. 邓紫棋 (mandopop ballad)
  insert into music.track_tags (user_id, track_id, tag_slug, confidence, source, locked) values
    (v_user, 'e21f8c4a654e70eaca572a3b6b4fcd5771e472094565be4d7857c7f5bb57a882', 'mandopop', 0.78, 'manual', false),
    (v_user, 'e21f8c4a654e70eaca572a3b6b4fcd5771e472094565be4d7857c7f5bb57a882', 'c-pop', 0.76, 'manual', false),
    (v_user, 'e21f8c4a654e70eaca572a3b6b4fcd5771e472094565be4d7857c7f5bb57a882', 'pop', 0.72, 'manual', false),
    (v_user, 'e21f8c4a654e70eaca572a3b6b4fcd5771e472094565be4d7857c7f5bb57a882', 'sad', 0.78, 'manual', false),
    (v_user, 'e21f8c4a654e70eaca572a3b6b4fcd5771e472094565be4d7857c7f5bb57a882', 'dramatic', 0.76, 'manual', false),
    (v_user, 'e21f8c4a654e70eaca572a3b6b4fcd5771e472094565be4d7857c7f5bb57a882', 'soft', 0.74, 'manual', false),
    (v_user, 'e21f8c4a654e70eaca572a3b6b4fcd5771e472094565be4d7857c7f5bb57a882', 'background', 0.74, 'manual', false),
    (v_user, 'e21f8c4a654e70eaca572a3b6b4fcd5771e472094565be4d7857c7f5bb57a882', 'shower', 0.72, 'manual', false),
    (v_user, 'e21f8c4a654e70eaca572a3b6b4fcd5771e472094565be4d7857c7f5bb57a882', 'playlist-continue-good', 0.70, 'manual', false),
    (v_user, 'e21f8c4a654e70eaca572a3b6b4fcd5771e472094565be4d7857c7f5bb57a882', 'lang-zh', 0.80, 'manual', false)
  on conflict (user_id, track_id, tag_slug, source) do update set confidence = excluded.confidence;

  -- seasons — wave to earth (indie alt-pop)
  insert into music.track_tags (user_id, track_id, tag_slug, confidence, source, locked) values
    (v_user, 'd04349e2e7e474e4ad81466a3ce8b898c62cc85c0b21f21e02e1f39c50ecbb00', 'alt-pop', 0.78, 'manual', false),
    (v_user, 'd04349e2e7e474e4ad81466a3ce8b898c62cc85c0b21f21e02e1f39c50ecbb00', 'pop', 0.74, 'manual', false),
    (v_user, 'd04349e2e7e474e4ad81466a3ce8b898c62cc85c0b21f21e02e1f39c50ecbb00', 'r-and-b', 0.70, 'manual', false),
    (v_user, 'd04349e2e7e474e4ad81466a3ce8b898c62cc85c0b21f21e02e1f39c50ecbb00', 'soft', 0.78, 'manual', false),
    (v_user, 'd04349e2e7e474e4ad81466a3ce8b898c62cc85c0b21f21e02e1f39c50ecbb00', 'sad', 0.76, 'manual', false),
    (v_user, 'd04349e2e7e474e4ad81466a3ce8b898c62cc85c0b21f21e02e1f39c50ecbb00', 'night-drive', 0.74, 'manual', false),
    (v_user, 'd04349e2e7e474e4ad81466a3ce8b898c62cc85c0b21f21e02e1f39c50ecbb00', 'background', 0.74, 'manual', false),
    (v_user, 'd04349e2e7e474e4ad81466a3ce8b898c62cc85c0b21f21e02e1f39c50ecbb00', 'walking', 0.72, 'manual', false),
    (v_user, 'd04349e2e7e474e4ad81466a3ce8b898c62cc85c0b21f21e02e1f39c50ecbb00', 'playlist-continue-good', 0.70, 'manual', false),
    (v_user, 'd04349e2e7e474e4ad81466a3ce8b898c62cc85c0b21f21e02e1f39c50ecbb00', 'lang-en', 0.75, 'manual', false)
  on conflict (user_id, track_id, tag_slug, source) do update set confidence = excluded.confidence;

  -- Mark all four as ready
  update music.track_enrichment e
  set tagging_status = 'ready',
      tag_confidence_avg = sub.avg_conf,
      analyzed_at = now()
  from (
    select track_id, round(avg(confidence)::numeric, 3) as avg_conf
    from music.track_tags
    where user_id = v_user
      and track_id in (
        '341c0f788a7e95ae48a4e3d6980602730d1a37525fd85098310cabc6be35e28f',
        'a3966c8bbdfcd7c6e8ce86c74db337fcc4278c5aca57641f336f01975d29dc7b',
        'e21f8c4a654e70eaca572a3b6b4fcd5771e472094565be4d7857c7f5bb57a882',
        'd04349e2e7e474e4ad81466a3ce8b898c62cc85c0b21f21e02e1f39c50ecbb00'
      )
    group by track_id
  ) sub
  where e.user_id = v_user and e.track_id = sub.track_id;
end $$;
