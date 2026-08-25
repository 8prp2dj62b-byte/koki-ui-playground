-- ANT-94 simple New Sale pipeline cleanup
-- NULL market_comparison means Gemini returned no usable market result, so FE hides the section.
alter table public.koki_listing_drafts_v3
  alter column market_comparison drop not null;

-- Retire the obsolete background market-research path.
do $$
begin
  if exists (select 1 from cron.job where jobname='koki-new-listing-evidence-repair-v1') then
    perform cron.unschedule('koki-new-listing-evidence-repair-v1');
  end if;
end $$;

drop trigger if exists trg_koki_listing_start_grounded_evidence_v8 on public.koki_listing_ai_operations_v3;
drop function if exists public.koki_listing_start_grounded_evidence_v8();
drop function if exists public.koki_schedule_listing_research_v12(uuid);
drop function if exists public.koki_retry_bg_retail_fallback_v13();
