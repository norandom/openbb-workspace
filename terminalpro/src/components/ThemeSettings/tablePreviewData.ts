import type { ColDef } from "ag-grid-community";
export const sampleData = (() => {
  const countries = [
    "Argentina",
    "Italy",
    "United Kingdom",
    "France",
    "Greece",
    "Luxembourg",
    "Sweden",
    "Brazil",
  ];
  const sports = [
    "Basketball",
    "Horse Racing",
    "Bowling",
    "Bobsleigh",
    "Darts",
    "Snowboarding",
    "Tennis",
    "Skateboarding",
  ];
  const names = [
    "Layla Cole",
    "Isabella Corbin",
    "Sophie Brock",
    "Grace Corbin",
    "Ella Griffin",
    "Lily Donovan",
    "Grace Black",
    "Lily Dallas",
  ];

  const data = [];
  for (let i = 0; i < 50; i++) {
    data.push({
      country: countries[i % countries.length],
      sport: sports[i % sports.length],
      name: names[i % names.length],
      totalWinnings: Math.floor(Math.random() * 100000) + 30000,
      winnings2023: Math.floor(Math.random() * 50000) + 10000,
      winnings2022: Math.floor(Math.random() * 50000) + 5000,
      selected: Math.random() > 0.7,
    });
  }
  return data;
})();

export const columnDefs: ColDef[] = [
  {
    field: "selected",
    headerName: "",
    width: 50,
  },
  { field: "country", headerName: "Country", width: 150 },
  { field: "sport", headerName: "Sport", width: 150 },
  { field: "name", headerName: "Name", width: 200 },
  {
    field: "totalWinnings",
    headerName: "Total winnings",
    width: 150,
    valueFormatter: (params) => `$${params.value?.toLocaleString()}`,
  },
  {
    field: "winnings2023",
    headerName: "2023 winnings",
    width: 150,
    valueFormatter: (params) => `$${params.value?.toLocaleString()}`,
  },
  {
    field: "winnings2022",
    headerName: "2022 winnings",
    width: 150,
    valueFormatter: (params) => `$${params.value?.toLocaleString()}`,
  },
];

export const defaultGridProps = {
  defaultColDef: {
    editable: true,
    flex: 1,
    minWidth: 100,
    filter: "agTextColumnFilter",
    sortable: true,
    resizable: true,
  },
  paginationPageSize: 25,
  paginationPageSizeSelector: [25, 50, 100],
  pagination: true,
};
