-- ==========================================
-- FASTCORD P0: ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- 1. YARDIMCI FONKSİYONLAR (Güvenlik kontrollerini hızlandırmak için)
CREATE OR REPLACE FUNCTION public.is_server_member(server_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.server_members 
    WHERE server_id = server_uuid AND user_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.has_server_role(server_uuid UUID, required_role TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.server_members
    WHERE server_id = server_uuid AND user_id = auth.uid() AND role = required_role
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.is_server_owner(server_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.servers
    WHERE id = server_uuid AND owner_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.is_current_user_server_banned(server_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.server_bans
    WHERE server_id = server_uuid AND user_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '';

ALTER FUNCTION public.is_server_member(UUID) SET search_path = '';
REVOKE ALL ON FUNCTION public.is_server_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_server_role(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_server_owner(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_current_user_server_banned(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_server_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_server_role(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_server_owner(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_user_server_banned(UUID) TO authenticated;

-- 2. SERVERS (Sunucular)
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;

-- Herkes sunucuları görebilir (Keşfet ekranı vs. için)
DROP POLICY IF EXISTS "Herkes sunucuları görebilir" ON public.servers;
CREATE POLICY "Herkes sunucuları görebilir" ON public.servers FOR SELECT USING (true);
-- Sadece giriş yapmış kullanıcılar sunucu oluşturabilir
DROP POLICY IF EXISTS "Sadece üyeler sunucu oluşturabilir" ON public.servers;
CREATE POLICY "Sadece üyeler sunucu oluşturabilir" ON public.servers FOR INSERT WITH CHECK (auth.uid() = owner_id);
-- Sadece sunucu sahibi güncelleyebilir veya silebilir
DROP POLICY IF EXISTS "Sadece sahipler güncelleyebilir" ON public.servers;
CREATE POLICY "Sadece sahipler güncelleyebilir" ON public.servers FOR UPDATE USING (owner_id = auth.uid());
DROP POLICY IF EXISTS "Sadece sahipler silebilir" ON public.servers;
CREATE POLICY "Sadece sahipler silebilir" ON public.servers FOR DELETE USING (owner_id = auth.uid());

-- 3. SERVER MEMBERS (Sunucu Üyeleri)
ALTER TABLE public.server_members ENABLE ROW LEVEL SECURITY;

-- Kullanıcılar kendi oldukları sunucudaki herkesi görebilir
DROP POLICY IF EXISTS "Kullanıcılar üyeleri görebilir" ON public.server_members;
CREATE POLICY "Kullanıcılar üyeleri görebilir" ON public.server_members FOR SELECT USING (public.is_server_member(server_id));
-- Katılma (Insert) işlemi genellikle davet kodu veya invite sistemi üzerinden olmalıdır, 
-- Ancak MVP için kullanıcıların (kendi adlarına) kayıt atmasına izin veriyoruz
DROP POLICY IF EXISTS "Kullanıcılar kendilerini ekleyebilir" ON public.server_members;
CREATE POLICY "Kullanıcılar kendilerini ekleyebilir" ON public.server_members FOR INSERT WITH CHECK (
  user_id = auth.uid() AND (
    role = 'member' OR (role = 'owner' AND public.is_server_owner(server_id))
  ) AND NOT public.is_current_user_server_banned(server_id)
);
-- Sadece Sahip veya Admin başkasının rolünü güncelleyebilir
DROP POLICY IF EXISTS "Adminler rolleri değiştirebilir" ON public.server_members;
CREATE POLICY "Adminler rolleri değiştirebilir" ON public.server_members FOR UPDATE
USING (public.is_server_owner(server_id))
WITH CHECK (
  public.is_server_owner(server_id) AND
  (role <> 'owner' OR EXISTS (
    SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = user_id
  ))
);
-- Kişi kendisi çıkabilir (Leave), Sahip veya Admin başkasını atabilir (Kick)
DROP POLICY IF EXISTS "Çıkış veya Kick" ON public.server_members;
CREATE POLICY "Çıkış veya Kick" ON public.server_members FOR DELETE USING (
  (user_id = auth.uid() AND role <> 'owner') OR
  (public.is_server_owner(server_id) AND user_id <> auth.uid())
);

-- 4. CHANNELS & CATEGORIES (Kategoriler ve Kanallar)
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Üyeler kategorileri görebilir" ON public.categories;
CREATE POLICY "Üyeler kategorileri görebilir" ON public.categories FOR SELECT USING (public.is_server_member(server_id));
DROP POLICY IF EXISTS "Üyeler kanalları görebilir" ON public.channels;
CREATE POLICY "Üyeler kanalları görebilir" ON public.channels FOR SELECT USING (public.is_server_member(server_id));

-- Sadece Owner veya Admin kanal/kategori oluşturabilir, düzenleyebilir ve silebilir
DROP POLICY IF EXISTS "Adminler kanal açabilir" ON public.channels;
CREATE POLICY "Adminler kanal açabilir" ON public.channels FOR ALL USING (
  public.has_server_role(server_id, 'owner') OR public.has_server_role(server_id, 'admin')
);
DROP POLICY IF EXISTS "Adminler kategori açabilir" ON public.categories;
CREATE POLICY "Adminler kategori açabilir" ON public.categories FOR ALL USING (
  public.has_server_role(server_id, 'owner') OR public.has_server_role(server_id, 'admin')
);

-- 5. SERVER BANS (Yasaklamalar)
ALTER TABLE public.server_bans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Adminler ban listesini görebilir" ON public.server_bans;
CREATE POLICY "Adminler ban listesini görebilir" ON public.server_bans FOR SELECT USING (
  public.has_server_role(server_id, 'owner') OR public.has_server_role(server_id, 'admin')
);
DROP POLICY IF EXISTS "Adminler ban atabilir/kaldırabilir" ON public.server_bans;
CREATE POLICY "Adminler ban atabilir/kaldırabilir" ON public.server_bans FOR ALL USING (
  public.is_server_owner(server_id)
) WITH CHECK (public.is_server_owner(server_id));

-- 6. SERVER MESSAGES (Sunucu Mesajları)
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Mesajın bağlı olduğu kanaldaki sunucunun üyesi olmak okumak ve yazmak için şarttır
DROP POLICY IF EXISTS "Üyeler mesaj okuyabilir" ON public.messages;
CREATE POLICY "Üyeler mesaj okuyabilir" ON public.messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM channels c WHERE c.id = channel_id AND public.is_server_member(c.server_id))
);
DROP POLICY IF EXISTS "Üyeler mesaj gönderebilir" ON public.messages;
CREATE POLICY "Üyeler mesaj gönderebilir" ON public.messages FOR INSERT WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM channels c WHERE c.id = channel_id AND public.is_server_member(c.server_id))
);
-- Sadece mesajın sahibi veya Sunucu Admin/Owner'ı silebilir, Sadece sahibi güncelleyebilir
DROP POLICY IF EXISTS "Mesaj sahibi güncelleyebilir" ON public.messages;
CREATE POLICY "Mesaj sahibi güncelleyebilir" ON public.messages FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id AND EXISTS (
  SELECT 1 FROM channels c WHERE c.id = channel_id AND public.is_server_member(c.server_id)
));
DROP POLICY IF EXISTS "Mesaj sahibi veya Admin silebilir" ON public.messages;
CREATE POLICY "Mesaj sahibi veya Admin silebilir" ON public.messages FOR DELETE USING (
  auth.uid() = user_id OR EXISTS (SELECT 1 FROM channels c WHERE c.id = channel_id AND (public.has_server_role(c.server_id, 'owner') OR public.has_server_role(c.server_id, 'admin')))
);

-- 7. DM MESSAGES & MEMBERS (Özel Mesajlar)
ALTER TABLE public.dm_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.dm_channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "DM participants can read channels" ON public.dm_channels;
CREATE POLICY "DM participants can read channels" ON public.dm_channels FOR SELECT USING (
  auth.uid() IN (user1_id, user2_id)
);
DROP POLICY IF EXISTS "DM participants can create channels" ON public.dm_channels;
CREATE POLICY "DM participants can create channels" ON public.dm_channels FOR INSERT WITH CHECK (
  auth.uid() IN (user1_id, user2_id) AND user1_id <> user2_id
);

DROP POLICY IF EXISTS "Sadece sohbettekiler DM üyelerini görebilir" ON public.dm_members;
CREATE POLICY "Sadece sohbettekiler DM üyelerini görebilir" ON public.dm_members FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.dm_channels d WHERE d.id = dm_members.dm_id AND auth.uid() IN (d.user1_id, d.user2_id))
);
DROP POLICY IF EXISTS "Sadece sohbettekiler DM mesajlarını görebilir" ON public.dm_messages;
CREATE POLICY "Sadece sohbettekiler DM mesajlarını görebilir" ON public.dm_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.dm_channels d WHERE d.id = dm_channel_id AND auth.uid() IN (d.user1_id, d.user2_id))
);
DROP POLICY IF EXISTS "Sadece sohbettekiler DM mesajı atabilir" ON public.dm_messages;
CREATE POLICY "Sadece sohbettekiler DM mesajı atabilir" ON public.dm_messages FOR INSERT WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.dm_channels d WHERE d.id = dm_channel_id AND auth.uid() IN (d.user1_id, d.user2_id))
);
DROP POLICY IF EXISTS "DM participants can update own messages" ON public.dm_messages;
CREATE POLICY "DM participants can update own messages" ON public.dm_messages FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id AND EXISTS (
  SELECT 1 FROM public.dm_channels d WHERE d.id = dm_channel_id AND auth.uid() IN (d.user1_id, d.user2_id)
));
DROP POLICY IF EXISTS "DM participants can delete own messages" ON public.dm_messages;
CREATE POLICY "DM participants can delete own messages" ON public.dm_messages FOR DELETE USING (
  auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.dm_channels d WHERE d.id = dm_channel_id AND auth.uid() IN (d.user1_id, d.user2_id)
  )
);

-- 8. FRIENDS, PROFILES, AND NOTIFICATIONS
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Friend participants can read requests" ON public.friendships;
CREATE POLICY "Friend participants can read requests" ON public.friendships FOR SELECT
USING (auth.uid() IN (requester_id, addressee_id));
DROP POLICY IF EXISTS "Users can send their own friend requests" ON public.friendships;
CREATE POLICY "Users can send their own friend requests" ON public.friendships FOR INSERT
WITH CHECK (requester_id = auth.uid() AND addressee_id <> auth.uid() AND status = 'pending');
DROP POLICY IF EXISTS "Recipients can accept friend requests" ON public.friendships;
CREATE POLICY "Recipients can accept friend requests" ON public.friendships FOR UPDATE
USING (addressee_id = auth.uid() AND status = 'pending')
WITH CHECK (addressee_id = auth.uid() AND status IN ('accepted', 'rejected'));
DROP POLICY IF EXISTS "Friend participants can remove requests" ON public.friendships;
CREATE POLICY "Friend participants can remove requests" ON public.friendships FOR DELETE
USING (auth.uid() IN (requester_id, addressee_id));

CREATE OR REPLACE FUNCTION public.prevent_friend_participant_change()
RETURNS trigger AS $$
BEGIN
  IF (NEW.requester_id, NEW.addressee_id) IS DISTINCT FROM (OLD.requester_id, OLD.addressee_id)
     AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Friend request participants cannot be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';
DROP TRIGGER IF EXISTS friendship_participants_immutable ON public.friendships;
CREATE TRIGGER friendship_participants_immutable
BEFORE UPDATE ON public.friendships
FOR EACH ROW EXECUTE FUNCTION public.prevent_friend_participant_change();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can find profiles" ON public.profiles;
CREATE POLICY "Authenticated users can find profiles" ON public.profiles FOR SELECT
USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE
USING (id = auth.uid()) WITH CHECK (id = auth.uid());

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read their own notifications" ON public.notifications;
CREATE POLICY "Users can read their own notifications" ON public.notifications FOR SELECT
USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can mark their own notifications read" ON public.notifications;
CREATE POLICY "Users can mark their own notifications read" ON public.notifications FOR UPDATE
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Attachments are private. A user may read their own uploads or files attached to a message
-- that Row Level Security already permits them to see.
UPDATE storage.buckets SET public = false WHERE id = 'attachments';
DROP POLICY IF EXISTS "Herkes dosyaları okuyabilir" ON storage.objects;
DROP POLICY IF EXISTS "Users can read attachments in visible messages" ON storage.objects;
CREATE POLICY "Users can read attachments in visible messages" ON storage.objects FOR SELECT
USING (
  bucket_id = 'attachments' AND (
    (storage.foldername(name))[1] = auth.uid()::text OR
    EXISTS (SELECT 1 FROM public.messages m WHERE m.image_url = storage.objects.name) OR
    EXISTS (SELECT 1 FROM public.dm_messages m WHERE m.image_url = storage.objects.name)
  )
);

DROP POLICY IF EXISTS "Giriş yapanlar dosya yükleyebilir" ON storage.objects;
DROP POLICY IF EXISTS "Users upload attachments to their own folder" ON storage.objects;
CREATE POLICY "Users upload attachments to their own folder" ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'attachments' AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND COALESCE((metadata->>'size')::bigint, 0) BETWEEN 1 AND 10485760
  AND metadata->>'mimetype' IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')
);

DROP POLICY IF EXISTS "Sadece sahibi dosya silebilir" ON storage.objects;
DROP POLICY IF EXISTS "Users delete their own attachments" ON storage.objects;
CREATE POLICY "Users delete their own attachments" ON storage.objects FOR DELETE
USING (bucket_id = 'attachments' AND owner = auth.uid());
