export interface PollVote {
  memberId: string;
  optionIndex: number;
}

export interface PollOptionResult {
  index: number;
  votes: number;
  /** Empty for anonymous polls. */
  memberIds: string[];
}

export interface PollResults {
  options: PollOptionResult[];
  totalVotes: number;
  totalVoters: number;
}

/** Counts votes per option; voter identities are only exposed for non-anonymous polls. */
export function tallyPoll(
  optionCount: number,
  votes: readonly PollVote[],
  anonymous: boolean,
): PollResults {
  const options: PollOptionResult[] = Array.from({ length: optionCount }, (_, index) => ({
    index,
    votes: 0,
    memberIds: [],
  }));
  const voters = new Set<string>();
  let total = 0;
  for (const v of votes) {
    const o = options[v.optionIndex];
    if (!o) continue;
    o.votes++;
    total++;
    voters.add(v.memberId);
    if (!anonymous) o.memberIds.push(v.memberId);
  }
  return { options, totalVotes: total, totalVoters: voters.size };
}

/** Returns an error message for an invalid selection, or null when it is valid. */
export function validateVoteSelection(
  optionIndexes: readonly number[],
  optionCount: number,
  multiple: boolean,
): string | null {
  if (optionIndexes.length === 0) return 'Select at least one option';
  if (new Set(optionIndexes).size !== optionIndexes.length) return 'Duplicate options';
  if (optionIndexes.some((i) => !Number.isInteger(i) || i < 0 || i >= optionCount))
    return 'Unknown option';
  if (!multiple && optionIndexes.length > 1) return 'Only one option allowed';
  return null;
}

export function isPollOpen(
  poll: { closesAt: Date | null; closedAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (poll.closedAt) return false;
  return !poll.closesAt || poll.closesAt > now;
}
