'use client';

import { useFormState } from 'react-dom';
import { Input, Label } from '@/components/field';
import { SubmitButton } from '@/components/submit-button';
import { saveBreakevenThreshold, type BreakevenThresholdState } from './actions';

interface BreakevenThresholdFormProps {
  defaultValue: string;
}

export function BreakevenThresholdForm({ defaultValue }: BreakevenThresholdFormProps) {
  const [state, formAction] = useFormState<BreakevenThresholdState, FormData>(
    saveBreakevenThreshold,
    {},
  );

  return (
    <form action={formAction} className="space-y-3">
      <Label htmlFor="breakevenThreshold">Break Even Cutoff Threshold (± Account Currency)</Label>
      <div className="flex items-center gap-3">
        <Input
          id="breakevenThreshold"
          name="breakevenThreshold"
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          defaultValue={defaultValue}
          placeholder="5.00"
        />
        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
      </div>
      <p className="text-tertiary text-xs">
        Trades with net P&amp;L between −${defaultValue || '5.00'} and +${defaultValue || '5.00'} (like small commission costs or scratch trades) will be categorized as Break Even instead of distorting your Win/Loss rate statistics.
      </p>
      {state.error ? (
        <p className="text-loss text-xs">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-accent-signal text-xs">Break Even threshold saved.</p>
      ) : null}
    </form>
  );
}
