import { useState } from "react";
import { Alert, Badge, Card, Container, Loader, NumberInput, Table, Text } from "@mantine/core";
import { errorMessage } from "../../../lib/http";
import { PageHeader } from "../../../ui/components/PageHeader";
import { useLeaveHolidays } from "../api/hooks";

export default function LeaveCalendarPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const calendar = useLeaveHolidays(year);
  return <Container size="md">
    <PageHeader title="Holiday Calendar" subtitle="Published holidays and restricted holidays" />
    <NumberInput label="Year" value={year} min={1900} max={9999} allowDecimal={false} mb="md"
      onChange={(value) => {
        if (typeof value === "number" && value >= 1900 && value <= 9999) setYear(value);
      }} />
    <Card withBorder>
      {calendar.isLoading && <Loader size="sm" />}
      {calendar.error && <Alert color="red">{errorMessage(calendar.error)}</Alert>}
      {calendar.isSuccess && !calendar.data.length && <Text>No published holidays for {year}.</Text>}
      <Table><Table.Thead><Table.Tr>
        <Table.Th>Date</Table.Th><Table.Th>Name</Table.Th><Table.Th>Type</Table.Th>
      </Table.Tr></Table.Thead><Table.Tbody>
        {calendar.data?.map((item) => <Table.Tr key={item.id}>
          <Table.Td>{item.date}</Table.Td><Table.Td>{item.name}</Table.Td>
          <Table.Td><Badge variant="light">{item.is_restricted ? "RH" : item.kind}</Badge></Table.Td>
        </Table.Tr>)}
      </Table.Tbody></Table>
    </Card>
  </Container>;
}
