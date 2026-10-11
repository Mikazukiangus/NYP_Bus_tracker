import React from 'react';

interface ServiceChoiceProps {
  serviceNos: string[]; // every bus between the same two stops, in the order to show
  chosen: string;
  notDue?: string[]; // buses with none due now, shown greyed out (they can still be chosen)
  // Omitted: shown only (e.g. inside a button that selects the whole trip)
  onChoose?: (serviceNo: string) => void;
  chosenClassName?: string; // colour of the chosen bus
  size?: 'sm' | 'md' | 'fit'; // fit: small in a narrow @container, md in a wide one
  label?: string; // what the buses are for, for screen readers
}

// The bus numbers that can be taken for one step of a trip, grouped on a tint (wrapping in narrow spaces):
// the chosen bus filled in, the others white. A single bus is a plain number chip.
export const ServiceChoice: React.FC<ServiceChoiceProps> = ({
  serviceNos,
  chosen,
  notDue = [],
  onChoose,
  chosenClassName = 'bg-helvetia text-white',
  size = 'md',
  label,
}) => {
  const isChosen = (no: string) => no.toUpperCase() === chosen.toUpperCase();
  const isNotDue = (no: string) => notDue.some((n) => n.toUpperCase() === no.toUpperCase());
  const sizing = {
    md: 'text-sm px-2 min-w-[2.5rem]',
    sm: 'text-[11px] px-1.5 min-w-[2rem]',
    fit: 'text-xs px-1.5 min-w-[2rem] @lg:text-sm @lg:px-2 @lg:min-w-[2.5rem]',
  }[size];
  const height = onChoose ? (size === 'sm' ? 'py-0.5 min-h-6' : 'py-1') : 'py-0.5';

  if (serviceNos.length <= 1) {
    return <span className={`inline-block text-center font-black rounded-lg shrink-0 ${sizing} ${height} ${chosenClassName}`}>{chosen}</span>;
  }

  return (
    <span
      role="group"
      aria-label={label ?? `Any of buses ${serviceNos.join(', ')}`}
      className="inline-flex flex-wrap gap-0.5 p-0.5 rounded-lg bg-helvetia-100 max-w-full"
    >
      {serviceNos.map((no) => {
        const classes = `text-center font-black rounded-md ${sizing} ${height} ${
          isChosen(no) ? chosenClassName : isNotDue(no) ? 'bg-white/70 text-warm-400' : 'bg-white text-helvetia-800'
        }`;
        const due = isNotDue(no) ? ' (no bus due now)' : '';
        return onChoose ? (
          <button
            key={no}
            type="button"
            onClick={() => !isChosen(no) && onChoose(no)}
            aria-pressed={isChosen(no)}
            title={isChosen(no) ? `Bus ${no} chosen${due}` : `Take Bus ${no} instead${due}`}
            className={`${classes} ${isChosen(no) ? 'cursor-default' : 'hover:bg-helvetia-50'}`}
          >
            {no}
          </button>
        ) : (
          <span key={no} className={classes} title={due ? `Bus ${no}${due}` : undefined}>
            {no}
          </span>
        );
      })}
    </span>
  );
};
