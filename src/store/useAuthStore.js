import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { fetchProfile as fetchProfileRecord } from '../lib/profileMedia';

let authSubscription;
let initializationPromise;
let authEventSequence = 0;

const profileForSession = async (session, fetchProfile) => {
  if (!session) return null;
  const profile = await fetchProfile(session.user.id);
  return profile || {
    id: session.user.id,
    email: session.user.email,
    username: session.user.user_metadata?.username || session.user.email?.split('@')[0] || 'User',
    avatar_url: null,
    banner_url: null,
    bio: '',
  };
};

const fallbackUserForSession = (session) => session ? ({
  id: session.user.id,
  email: session.user.email,
  username: session.user.user_metadata?.username || session.user.email?.split('@')[0] || 'User',
  avatar_url: null,
  banner_url: null,
  bio: '',
}) : null;

const publishSession = (session, sequence, get, set) => {
  const previousUser = get().user;
  const user = previousUser?.id === session?.user?.id ? previousUser : fallbackUserForSession(session);
  // Supabase keeps the session in local storage. Render the app shell from that
  // cached session first, then hydrate the profile without flashing AuthScreen.
  set({ session, user, isInitialized: true });
  if (!session) return;
  void profileForSession(session, get().fetchProfile).then((profile) => {
    if (sequence === authEventSequence && get().session?.user?.id === session.user.id) set({ session, user: profile, isInitialized: true });
  });
};

export const useAuthStore = create((set, get) => ({
  session: null,
  user: null, // This will now hold data from 'profiles' table
  isInitialized: false,

  fetchProfile: async (userId) => {
    if (!userId) return null;
    try {
      return await fetchProfileRecord(userId);
    } catch (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
  },

  refreshProfile: async () => {
    const session = get().session;
    if (!session) return;
    const user = await profileForSession(session, get().fetchProfile);
    if (get().session?.user.id === session.user.id) set({ user });
  },

  initialize: () => {
    if (initializationPromise) return initializationPromise;
    initializationPromise = (async () => {
      if (!authSubscription) {
        const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
          const sequence = ++authEventSequence;
          // Do not await Supabase queries inside its auth callback; that can deadlock its auth lock.
          setTimeout(() => publishSession(nextSession, sequence, get, set), 0);
        });
        authSubscription = data.subscription;
      }

      const sequence = authEventSequence;
      const { data: { session } } = await supabase.auth.getSession();
      if (sequence === authEventSequence) publishSession(session, sequence, get, set);
    })().catch((error) => {
      initializationPromise = null;
      console.error('Could not initialize authentication:', error);
      set({ session: null, user: null, isInitialized: true });
    });
    return initializationPromise;
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }
}));
