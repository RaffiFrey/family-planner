# ADR-0004: Money as integer minor units; recurrence on wall time

Status: accepted

Amounts are integer minor units (bigint in Postgres, safe integers in JS) with an ISO currency; arithmetic and
allocation go through dinero.js — no floats anywhere. Time is stored as UTC instants plus an IANA zone;
RRULE expansion runs on floating wall time so events keep their local time across DST. All-day items are
floating UTC midnights with exclusive ends.
