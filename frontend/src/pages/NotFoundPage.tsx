import { Page, EmptyState, LinkButton } from "../design-system";

export default function NotFoundPage() {
  return (
    <Page title="Página não encontrada">
      <EmptyState title="Esse endereço não existe">
        <p>Volte para a página inicial e escolha o seu perfil.</p>
        <div style={{ marginTop: 16 }}>
          <LinkButton to="/" variant="primary">
            Ir para o início
          </LinkButton>
        </div>
      </EmptyState>
    </Page>
  );
}
