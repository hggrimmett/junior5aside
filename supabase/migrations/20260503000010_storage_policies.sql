-- Storage policies for player-photos bucket

-- Anyone can view photos (public bucket)
CREATE POLICY "public_read_player_photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'player-photos');

-- Authenticated users can upload photos
CREATE POLICY "auth_upload_player_photos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'player-photos' AND auth.role() = 'authenticated');

-- Users can update their own uploads
CREATE POLICY "auth_update_player_photos" ON storage.objects
  FOR UPDATE USING (bucket_id = 'player-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can delete their own uploads
CREATE POLICY "auth_delete_player_photos" ON storage.objects
  FOR DELETE USING (bucket_id = 'player-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
