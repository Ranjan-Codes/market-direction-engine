-- Allow 'gauge' backtest segments: the reversal-risk gauge (north-star)
-- is validated alongside per-stock signals.
alter table backtest_results drop constraint backtest_results_segment_type_check;
alter table backtest_results add constraint backtest_results_segment_type_check
  check (segment_type in
    ('overall','signal_type','regime','index','out_of_sample','walk_forward','gauge'));
