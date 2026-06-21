"use client";

import { SHIPMENT_STATUS, type ShipmentStatus } from "@/types/shipment";

type StatusShipmentSelectProps = {
  value: ShipmentStatus;
  onChange: (value: ShipmentStatus) => void;
};

export function StatusShipmentSelect({
  value,
  onChange,
}: StatusShipmentSelectProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-[var(--steel)]">
        Status Shipment
      </span>
      <select
        className="ind-input focus:bg-[var(--surface)]"
        value={value}
        onChange={(event) => onChange(event.target.value as ShipmentStatus)}
      >
        {SHIPMENT_STATUS.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
    </label>
  );
}
