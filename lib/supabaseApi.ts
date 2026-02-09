import { supabase } from './supabaseClient';
import type { AgeBand, ChallengeScore, DailyScore, LeaderboardEntry, UserProfile } from './types';

type ProfileRow = {
  id: string;
  username: string;
  email: string;
  age_band: AgeBand;
  created_at: string;
};

type DailyScoreRow = {
  user_id: string;
  game_date: string;
  total_score: number | null;
  challenge_scores: ChallengeScore[] | null;
  updated_at: string | null;
  profiles?: {
    username: string;
    age_band: AgeBand;
  } | null;
  username?: string;
  age_band?: AgeBand;
};

type LeaderboardRow = {
  username?: string;
  age_band?: AgeBand;
  total_score?: number | null;
  score?: number | null;
};

export interface SupabaseProfile extends UserProfile {
  id: string;
}

const PROFILE_SELECT = 'id, username, email, age_band, created_at';

const mapProfile = (row: ProfileRow): SupabaseProfile => ({
  id: row.id,
  username: row.username,
  email: row.email,
  ageBand: row.age_band,
  createdAt: Date.parse(row.created_at)
});

const mapDailyScore = (row: DailyScoreRow): DailyScore => {
  const username = row.profiles?.username ?? row.username ?? 'Unknown';
  const ageBand = row.profiles?.age_band ?? row.age_band ?? '16+';
  return {
    dateKey: row.game_date,
    totalScore: row.total_score ?? 0,
    challengeScores: row.challenge_scores ?? [],
    username,
    ageBand,
    updatedAt: row.updated_at ? Date.parse(row.updated_at) : Date.now()
  };
};

const mapLeaderboardRow = (row: LeaderboardRow): LeaderboardEntry => ({
  name: row.username ?? 'Unknown',
  ageBand: row.age_band ?? '16+',
  score: row.total_score ?? row.score ?? 0
});

const applyAgeBandFilter = (query: ReturnType<typeof supabase.from>, ageBandFilter?: AgeBand | 'All') => {
  if (ageBandFilter && ageBandFilter !== 'All') {
    return query.eq('age_band', ageBandFilter);
  }
  return query;
};

export async function createProfile(params: {
  username: string;
  email: string;
  ageBand: AgeBand;
}): Promise<SupabaseProfile> {
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      username: params.username,
      email: params.email,
      age_band: params.ageBand
    })
    .select(PROFILE_SELECT)
    .single();

  if (error || !data) {
    throw error ?? new Error('Unable to create profile');
  }

  return mapProfile(data as ProfileRow);
}

export async function getProfileByUsername(username: string): Promise<SupabaseProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('username', username)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapProfile(data as ProfileRow) : null;
}

export async function getOrCreateProfileByUsername(params: {
  username: string;
  email: string;
  ageBand: AgeBand;
}): Promise<SupabaseProfile> {
  const existing = await getProfileByUsername(params.username);
  if (existing) {
    return existing;
  }
  return createProfile(params);
}

export async function getUserDayRow(userId: string, dateKey: string): Promise<DailyScore | null> {
  const { data, error } = await supabase
    .from('daily_scores')
    .select('user_id, game_date, total_score, challenge_scores, updated_at, profiles ( username, age_band )')
    .eq('user_id', userId)
    .eq('game_date', dateKey)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapDailyScore(data as DailyScoreRow) : null;
}

export async function upsertUserDayRow(params: {
  userId: string;
  dateKey: string;
  challengeScore: ChallengeScore;
}): Promise<DailyScore> {
  const existing = await getUserDayRow(params.userId, params.dateKey);
  const nextScores = [...(existing?.challengeScores ?? []), params.challengeScore].slice(0, 5);
  const totalScore = nextScores.reduce((sum, item) => sum + item.score, 0);

  const { data, error } = await supabase
    .from('daily_scores')
    .upsert(
      {
        user_id: params.userId,
        game_date: params.dateKey,
        total_score: totalScore,
        challenge_scores: nextScores
      },
      { onConflict: 'user_id,game_date' }
    )
    .select('user_id, game_date, total_score, challenge_scores, updated_at, profiles ( username, age_band )')
    .single();

  if (error || !data) {
    throw error ?? new Error('Unable to update daily score');
  }

  return mapDailyScore(data as DailyScoreRow);
}

export async function getLeaderboardToday(
  dateKey: string,
  ageBandFilter?: AgeBand | 'All'
): Promise<LeaderboardEntry[]> {
  let query = supabase
    .from('daily_scores')
    .select('total_score, profiles ( username, age_band )')
    .eq('game_date', dateKey);

  if (ageBandFilter && ageBandFilter !== 'All') {
    query = query.eq('profiles.age_band', ageBandFilter);
  }

  const { data, error } = await query.order('total_score', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => {
    const profile = (row as DailyScoreRow).profiles;
    return mapLeaderboardRow({
      username: profile?.username,
      age_band: profile?.age_band,
      total_score: (row as DailyScoreRow).total_score
    });
  });
}

export async function getLeaderboardWeekly(ageBandFilter?: AgeBand | 'All'): Promise<LeaderboardEntry[]> {
  let query = supabase.from('leaderboard_weekly').select('username, age_band, total_score');
  query = applyAgeBandFilter(query, ageBandFilter);

  const { data, error } = await query.order('total_score', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => mapLeaderboardRow(row as LeaderboardRow));
}

export async function getLeaderboardMonthly(ageBandFilter?: AgeBand | 'All'): Promise<LeaderboardEntry[]> {
  let query = supabase.from('leaderboard_monthly').select('username, age_band, total_score');
  query = applyAgeBandFilter(query, ageBandFilter);

  const { data, error } = await query.order('total_score', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => mapLeaderboardRow(row as LeaderboardRow));
}
