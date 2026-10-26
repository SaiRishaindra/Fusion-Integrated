import { useState } from "react";
import {
  Alert, Badge, Button, Card, Container, Group, Loader, Modal,
  NumberInput, Select, SimpleGrid, Stack, Table, Text, Textarea, TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useAuth } from "../../../auth/AuthProvider";
import { errorMessage } from "../../../lib/http";
import { PageHeader } from "../../../ui/components/PageHeader";
import {
  useCreateLeaveApplication, useLeaveApplications, useLeaveBalances,
  useLeaveCategories, useLeaveHistory, useWithdrawLeave,
} from "../api/hooks";
import type { ApplicationInput } from "../api/types";

const emptyForm: ApplicationInput = {
  category_code: "", start_date: "", end_date: "", half_day: false,
  half_day_period: "", reason: "", substitute_user_id: null,
};

export default function LeaveDashboardPage() {
  const { can } = useAuth();
  const canCreate = can("employee_leave.application.create");
  const canView = can("employee_leave.application.view_self");
  const canBalance = can("employee_leave.balance.view");
  const balances = useLeaveBalances(canBalance);
  const applications = useLeaveApplications(canView);
  const categories = useLeaveCategories(canCreate);
  const create = useCreateLeaveApplication();
  const withdraw = useWithdrawLeave();
  const [form, setForm] = useState<ApplicationInput>(emptyForm);
  const [withdrawId, setWithdrawId] = useState<number | null>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);
  const history = useLeaveHistory(historyId);
  const selected = categories.data?.find((item) => item.code === form.category_code);
  const formError = form.start_date && form.end_date && form.end_date < form.start_date
    ? "End date must be on or after start date." : "";
  const ready = form.category_code && form.start_date && form.end_date
    && !formError && (!form.half_day || form.half_day_period);

  function submit() {
    if (!ready || create.isPending) return;
    create.mutate(form, {
      onSuccess: () => {
        setForm(emptyForm);
        notifications.show({ color: "green", message: "Leave application submitted" });
      },
      onError: (error) => notifications.show({ color: "red", message: errorMessage(error) }),
    });
  }

  function confirmWithdrawal() {
    if (withdrawId === null) return;
    withdraw.mutate(withdrawId, {
      onSuccess: () => setWithdrawId(null),
      onError: (error) => notifications.show({ color: "red", message: errorMessage(error) }),
    });
  }

  return (
    <Container size="lg">
      <PageHeader title="Employee Leave" subtitle="Balances and leave applications" />
      {canBalance && <>
        {balances.isLoading && <Loader size="sm" />}
        {balances.error && <Alert color="red" mb="md">{errorMessage(balances.error)}</Alert>}
        {balances.isSuccess && !balances.data.length &&
          <Text c="dimmed" mb="md">No leave balances have been configured.</Text>}
        <SimpleGrid cols={{ base: 1, sm: 3 }} mb="lg">
          {balances.data?.map((item) => (
            <Card withBorder key={item.id}>
              <Text fw={600}>{item.category.label} ({item.leave_year})</Text>
              <Text size="xl" fw={700}>{item.available}</Text>
              <Text size="xs" c="dimmed">Available days</Text>
              <Text size="xs">Used: {item.used} | Pending: {item.pending}</Text>
            </Card>
          ))}
        </SimpleGrid>
      </>}
      {canCreate && <Card withBorder mb="lg">
        <Stack>
          <Text fw={600}>New application</Text>
          {categories.error && <Alert color="red">{errorMessage(categories.error)}</Alert>}
          <Select label="Leave category" searchable value={form.category_code || null}
            disabled={categories.isLoading}
            data={(categories.data ?? []).map((item) => ({ value: item.code, label: item.label }))}
            onChange={(value) => setForm({ ...form, category_code: value ?? "",
              half_day: false, half_day_period: "", substitute_user_id: null })} />
          <Group grow>
            <TextInput label="Start date" type="date" value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.currentTarget.value })} />
            <TextInput label="End date" type="date" value={form.end_date}
              error={formError} min={form.start_date || undefined}
              onChange={(e) => setForm({ ...form, end_date: e.currentTarget.value })} />
          </Group>
          {selected?.code.toUpperCase() === "CL" &&
            <Select label="Duration" value={form.half_day_period || "full"}
              data={[{ value: "full", label: "Full day" },
                { value: "first", label: "First half" }, { value: "second", label: "Second half" }]}
              onChange={(value) => setForm({ ...form, half_day: value !== "full",
                half_day_period: value === "first" || value === "second" ? value : "" })} />}
          {selected?.requires_substitute && <NumberInput label="Substitute user ID" min={1}
            allowDecimal={false} value={form.substitute_user_id ?? ""}
            onChange={(value) => setForm({ ...form,
              substitute_user_id: typeof value === "number" ? value : null })} />}
          <Textarea label="Reason" value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.currentTarget.value })} />
          <Button onClick={submit} loading={create.isPending} disabled={!ready}>
            Submit leave application
          </Button>
        </Stack>
      </Card>}
      {canView && <Card withBorder>
        <Text fw={600} mb="sm">Applications</Text>
        {applications.isLoading && <Loader size="sm" />}
        {applications.error && <Alert color="red">{errorMessage(applications.error)}</Alert>}
        {applications.isSuccess && !applications.data.length && <Text>No applications yet.</Text>}
        <Table.ScrollContainer minWidth={650}>
          <Table striped>
            <Table.Thead><Table.Tr>
              <Table.Th>Category</Table.Th><Table.Th>Dates</Table.Th>
              <Table.Th>Status</Table.Th><Table.Th>Actions</Table.Th>
            </Table.Tr></Table.Thead>
            <Table.Tbody>{applications.data?.map((item) => (
              <Table.Tr key={item.id}>
                <Table.Td>{item.category.label}</Table.Td>
                <Table.Td>{item.start_date} to {item.end_date}
                  {item.half_day && <Text size="xs">{item.half_day_period} half</Text>}
                </Table.Td>
                <Table.Td><Badge variant="light">{item.status}</Badge></Table.Td>
                <Table.Td><Group gap="xs">
                  <Button size="xs" variant="subtle" onClick={() => setHistoryId(item.id)}>History</Button>
                  {item.status === "pending" && can("employee_leave.application.withdraw") &&
                    <Button size="xs" color="red" variant="subtle"
                      onClick={() => setWithdrawId(item.id)}>Withdraw</Button>}
                </Group></Table.Td>
              </Table.Tr>
            ))}</Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>}
      <Modal opened={withdrawId !== null} onClose={() => setWithdrawId(null)} title="Withdraw leave?">
        <Text mb="md">This ends the pending application. Submit a new application if needed.</Text>
        <Button color="red" loading={withdraw.isPending} onClick={confirmWithdrawal}>Withdraw</Button>
      </Modal>
      <Modal opened={historyId !== null} onClose={() => setHistoryId(null)} title="Application history">
        {history.isLoading && <Loader size="sm" />}
        {history.error && <Alert color="red">{errorMessage(history.error)}</Alert>}
        {history.isSuccess && !history.data.length && <Text>No recorded events for this application.</Text>}
        <Stack>{history.data?.map((event) => <Text key={event.id} size="sm">
          {new Date(event.created_at).toLocaleString()}: {event.action} ({event.to_status})
        </Text>)}</Stack>
      </Modal>
    </Container>
  );
}
