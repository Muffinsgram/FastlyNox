-- Deliver friend requests/accepts/removals through Supabase Realtime.
-- Safe to run more than once.

ALTER TABLE public.friendships REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'friendships'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
  END IF;
END;
$$;

-- Friend request notifications are delivered through the same notification
-- center used for mentions and chat activity. This block is safe to rerun and
-- skips the notification hooks if the notifications migration has not yet run.
DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    EXECUTE $function$
      CREATE OR REPLACE FUNCTION public.notify_friendship_changes()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = ''
      AS $body$
      BEGIN
        IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
          INSERT INTO public.notifications (user_id, type, title, body, sender_id)
          VALUES (
            NEW.addressee_id,
            'friend_request',
            'Yeni arkadaşlık isteği',
            COALESCE((SELECT username FROM public.profiles WHERE id = NEW.requester_id), 'Bir kullanıcı') || ' sana arkadaşlık isteği gönderdi.',
            NEW.requester_id
          );
        ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'accepted' THEN
          INSERT INTO public.notifications (user_id, type, title, body, sender_id)
          VALUES (
            NEW.requester_id,
            'friend_accepted',
            'Arkadaşlık isteğin kabul edildi',
            COALESCE((SELECT username FROM public.profiles WHERE id = NEW.addressee_id), 'Bir kullanıcı') || ' arkadaşlık isteğini kabul etti.',
            NEW.addressee_id
          );
        END IF;
        RETURN NEW;
      END;
      $body$
    $function$;

    DROP TRIGGER IF EXISTS notify_friendship_changes ON public.friendships;
    CREATE TRIGGER notify_friendship_changes
      AFTER INSERT OR UPDATE OF status ON public.friendships
      FOR EACH ROW EXECUTE FUNCTION public.notify_friendship_changes();

    ALTER TABLE public.notifications REPLICA IDENTITY FULL;
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
      AND NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'notifications'
      ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
  END IF;
END;
$$;
