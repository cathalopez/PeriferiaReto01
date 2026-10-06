# Conocimiento del proceso de Registro como Proveedor

Describe el proceso y las reglas. No contiene datos de casos: esos salen de las herramientas.

## El proceso

Los clientes piden a Periferia registrarse como proveedor (8–12 formularios al mes).
Los datos ya existen en un repositorio maestro. El agente lee la solicitud, llena el
formulario en el formato pedido, arma el paquete de soportes y lo deja listo para la
firma del representante legal. No firma ni envía.

## Los tres estados de un campo

- **lleno**: el glosario mapeó la etiqueta de forma exacta y el dato existe en el maestro.
- **faltante**: no existe en el maestro. Nunca se inventa.
- **requiere_confirmación**: coincidencia semántica del RAG (no exacta) o regla de país.

El mapeo intenta primero el **glosario** (coincidencia exacta). Si falla, usa el **RAG**
(coincidencia por significado con embeddings); como es una conjetura, su resultado es
`requiere_confirmación`, nunca `lleno`.

## Reglas de negocio

- **Identificador por país**: CO→NIT, EC/PE/PA→RUC, HN→RTN. Periferia solo tiene NIT
  colombiano; para otros países se propone el NIT y se marca `requiere_confirmación`
  ("identificador extranjero").
- **Datos bancarios**: solo si la plantilla los pide. Nunca en el borrador de correo.
- **Soportes**: un soporte **vencido** (vigencia anterior a hoy) o **ausente** bloquea
  "listo para firma". Un **campo faltante** NO lo bloquea; solo aparece en el checklist.
- **Formatos de salida**: Excel (se llena en celdas exactas), PDF (lista de campos),
  y portal web (no se implementa; se dejan los valores listos para copiar).

## Qué entrega el agente

El formulario diligenciado, el paquete con los soportes y el checklist
(presentes/vencidos/ausentes), un borrador de correo, y el estado "listo para firma".
