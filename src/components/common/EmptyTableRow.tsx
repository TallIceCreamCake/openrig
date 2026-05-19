import React from 'react';

interface EmptyTableRowProps {
  colSpan: number;
  message?: string;
}

const EmptyTableRow: React.FC<EmptyTableRowProps> = ({ colSpan, message }) => {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-8 text-center text-sm text-gray-500">
        {message || "Aucun élément à afficher"}
      </td>
    </tr>
  );
};

export default EmptyTableRow;

