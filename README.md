# YoPagoCL

YoPagoCL es una aplicación móvil y backend para dividir cuentas en restaurantes de manera colaborativa. Permite a los comensales escanear el código QR de la mesa, seleccionar los ítems que consumieron y dividir el pago entre múltiples participantes. Además, ofrece la opción de pagar por otros y que éstos le reembolsen más adelante, facilitando aún más la experiencia de pago grupal.

## 🚀 Características Principales

### Para Comensales
- **Escanear QR Code**: Escanea el código QR para unirte a la sesión
- **Selección de Ítems**: Marca los ítems que consumiste o que deseas pagar
- **Pago por Otros**: Opción para pagar por otros participantes
- **División Flexible**: El sistema calcula automáticamente el monto por persona
- **Pago con Wallet**: Sistema de billetera digital integrado
- **Tiempo Real**: Actualizaciones en tiempo real mediante WebSockets
- **Bloqueo de Sesión**: Bloquea la sesión cuando todos están listos para pagar

### Para Restaurantes
- **Gestión de QR Codes**: Crea sesiones con códigos QR únicos
- **Seguimiento en Tiempo Real**: Monitorea el estado de las sesiones activas
- **Cierre Automático**: La sesión se cierra automáticamente cuando todos han pagado

### Sistema de Pagos
- **Wallet Digital**: Los usuarios pueden recargar su wallet
- **Integración Transbank**: Pagos seguros mediante Transbank (Chile)
- **Gestión de Facturas**: Sistema completo de facturas con seguimiento de pagos
- **Recordatorios de Pago**: Envío de recordatorios para facturas pendientes
- **Notificaciones Push**: Sistema de notificaciones push para recordatorios de pago

### Grupos y Social
- **Grupos**: Crea grupos de amigos/familia para facilitar los pagos
- **Historial**: Consulta tu historial de pagos y facturas
- **Gestión de Perfil**: Actualiza tu perfil, nombre, teléfono y avatar

## 🏗️ Arquitectura

El proyecto está dividido en dos partes principales:

### Backend (`/backend`)
- **Framework**: FastAPI (Python)
- **Base de Datos**: SQLite con SQLModel/SQLAlchemy
- **Autenticación**: OAuth2 con Google + JWT tokens
- **WebSockets**: Comunicación en tiempo real
- **Migraciones**: Alembic
- **Pagos**: Integración con Transbank

### Frontend (`/frontend`)
- **Framework**: React Native 0.81.5 con Expo ~54.0.23
- **Navegación**: Expo Router ~6.0.14 (file-based routing)
- **UI**: Gluestack UI + NativeWind 4.2.1 (Tailwind CSS)
- **Cámara**: Expo Camera ~17.0.9 para escaneo de QR
- **WebSockets**: Cliente WebSocket para tiempo real
- **Notificaciones**: Expo Notifications para push notifications

## 📋 Requisitos Previos

### Backend
- Python 3.12+
- `uv` (gestor de paquetes Python)
- Credenciales de Google OAuth2
- Credenciales de Transbank (opcional, para pagos)

### Frontend
- Node.js 18+
- npm o yarn
- Expo CLI
- Dispositivo móvil o emulador para probar

## 🔧 Instalación

### Backend

1. Navega al directorio del backend:
```bash
cd backend/backend
```

2. Instala las dependencias:
```bash
uv sync
```

3. Crea un archivo `.env` en `backend/backend/` con las siguientes variables:
```env
# CORS
BACKEND_CORS_ORIGINS=http://localhost:3000,http://192.168.1.140:3000

# Entorno
ENVIRONMENT=local

# Seguridad
SECRET_KEY=tu-secret-key-super-segura-aqui
JWT_ALGORITHM=HS256

# Base de datos
SQLITE_FILE_NAME=database.db

# OAuth2 Google
GOOGLE_CLIENT_ID=tu-google-client-id
GOOGLE_CLIENT_SECRET=tu-google-client-secret

# Zona horaria
TIMEZONE=America/Santiago
```

4. Ejecuta las migraciones:
```bash
uv run alembic upgrade head
```

5. Inicia el servidor de desarrollo:
```bash
# Para desarrollo local (accesible desde dispositivos móviles en la misma red)
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000

# O usando FastAPI CLI
uv run fastapi dev main.py --host 0.0.0.0 --port 8000
```

El servidor estará disponible en:
- `http://localhost:8000` (desde tu máquina)
- `http://TU_IP_LOCAL:8000` (desde dispositivos móviles en la misma red)

### Frontend

1. Navega al directorio del frontend:
```bash
cd frontend/frontend
```

2. Instala las dependencias:
```bash
npm install
```

3. Configura la URL de la API en `services/api.ts` o mediante variable de entorno:
```bash
# En .env o directamente en el código
EXPO_PUBLIC_API_URL=http://TU_IP_LOCAL:8000
```

4. Inicia la aplicación:
```bash
npm start
# o
npx expo start
```

5. Escanea el código QR con la app Expo Go en tu dispositivo móvil, o presiona:
   - `i` para iOS Simulator
   - `a` para Android Emulator
   - `w` para web

## 📱 Uso de la Aplicación

### Para Usuarios

1. **Registro/Login**:
   - Crea una cuenta con email y contraseña, o
   - Inicia sesión con Google OAuth2

2. **Escanear QR Code**:
   - Ve a la pestaña "Scan"
   - Escanea el código QR
   - Te conectarás automáticamente a la sesión

3. **Seleccionar Ítems**:
   - Marca los ítems que consumiste o deseas pagar
   - Usa el menú (⋯) para pagar por otros usuarios
   - El sistema calcula automáticamente tu parte

4. **Bloquear y Pagar**:
   - Cuando todos estén listos, presiona "Lock to pay"
   - Verifica que todos los ítems estén asignados
   - Presiona "Pay my bill" para pagar con tu wallet
   - Recarga tu wallet si es necesario desde la sección de configuración

### Para Restaurantes

1. **Crear Sesión**:
   - Usa el script `create_session_qr.py` para generar una sesión
   - Se generará un código QR que los comensales pueden escanear

2. **Monitorear Sesión**:
   - Las sesiones se actualizan en tiempo real
   - Puedes ver quién se ha unido y qué ítems han seleccionado

3. **Cerrar Sesión**:
   - La sesión se cierra automáticamente cuando todos han pagado
   - O puedes cerrarla manualmente cuando sea necesario

## 🔌 API Endpoints

### Autenticación
- `POST /api/auth/register` - Registrar nuevo usuario
- `POST /api/auth/login` - Iniciar sesión
- `GET /api/auth/login/authorize` - Obtener URL de autorización OAuth
- `POST /api/auth/login/callback` - Callback OAuth
- `GET /api/auth/logout` - Cerrar sesión
- `GET /api/auth/users/search` - Buscar usuario por email
- `GET /api/auth/users/me` - Obtener perfil del usuario actual
- `PUT /api/auth/users/me` - Actualizar perfil del usuario
- `POST /api/auth/users/me/avatar` - Subir avatar del usuario

### Sesiones
- `POST /api/table_sessions` - Crear nueva sesión
- `GET /api/table_sessions/{session_id}` - Obtener sesión
- `GET /api/table_sessions/{session_id}/items` - Obtener ítems de la sesión
- `GET /api/table_sessions/{session_id}/participants` - Obtener participantes
- `PUT /api/table_sessions/{session_id}/close` - Cerrar sesión

### WebSocket
- `WS /api/ws/table_sessions/{session_id}` - Conexión WebSocket para tiempo real

### Facturas
- `POST /api/invoices` - Crear factura
- `GET /api/invoices` - Listar facturas (con filtros: user_id, status, group_id)
- `GET /api/invoices/available-groups` - Obtener grupos comunes entre dos usuarios
- `GET /api/invoices/users/{user_id}/invoices` - Obtener facturas de un usuario
- `GET /api/invoices/users/{user_id}/invoices/pending` - Obtener facturas pendientes de un usuario
- `GET /api/invoices/{invoice_id}` - Obtener factura
- `PUT /api/invoices/{invoice_id}` - Actualizar factura
- `PUT /api/invoices/{invoice_id}/mark-paid` - Marcar factura como pagada
- `POST /api/invoices/pay-bill` - Pagar factura con wallet

### Wallets
- `GET /api/wallets/users/{user_id}` - Obtener wallet del usuario
- `GET /api/wallets/users/{user_id}/with-transactions` - Obtener wallet con transacciones
- `GET /api/wallets/{wallet_id}` - Obtener wallet por ID
- `GET /api/wallets/{wallet_id}/transactions` - Obtener transacciones de un wallet
- `GET /api/wallets/users/{user_id}/transactions` - Obtener transacciones de un usuario
- `POST /api/wallets/top-up` - Recargar wallet (Transbank)

### Grupos
- `POST /api/groups` - Crear grupo
- `GET /api/groups/{group_id}` - Obtener grupo
- `GET /api/groups` - Listar grupos del usuario
- `PUT /api/groups/{group_id}` - Actualizar grupo
- `DELETE /api/groups/{group_id}` - Eliminar grupo
- `POST /api/groups/{group_id}/members` - Agregar miembro
- `DELETE /api/groups/{group_id}/members/{user_id}` - Remover miembro
- `GET /api/groups/{group_id}/members` - Listar miembros del grupo

### Recordatorios
- `POST /api/reminders` - Crear recordatorio de pago
- `GET /api/reminders` - Listar recordatorios (con filtros: invoice_id, status)
- `GET /api/reminders/invoices/{invoice_id}/reminders` - Obtener recordatorios de una factura
- `POST /api/reminders/send-push-notification` - Enviar notificación push para recordatorio

### Archivos
- `GET /api/avatars/{filename}` - Obtener imagen de avatar

## 🗄️ Base de Datos

El proyecto usa SQLite con las siguientes entidades principales:

- **Users**: Usuarios del sistema
- **Groups**: Grupos de usuarios
- **Restaurants**: Restaurantes
- **RestaurantTables**: Mesas de restaurantes
- **TableSessions**: Sesiones activas
- **TableParticipants**: Participantes en una sesión
- **OrderItems**: Ítems de la orden
- **ItemAssignments**: Asignaciones de ítems a participantes
- **Invoices**: Facturas entre usuarios
- **InvoiceItems**: Ítems de factura
- **Wallets**: Billeteras digitales
- **WalletTransactions**: Transacciones de wallet
- **PaymentReminders**: Recordatorios de pago

### Migraciones

Para crear una nueva migración:
```bash
uv run alembic revision --autogenerate -m "descripción de los cambios"
```

Para aplicar migraciones:
```bash
uv run alembic upgrade head
```

Para revertir la última migración:
```bash
uv run alembic downgrade -1
```

## 🔐 Seguridad

- Autenticación JWT para todas las rutas protegidas
- OAuth2 con Google usando PKCE
- Contraseñas hasheadas con bcrypt
- Validación de datos con Pydantic
- CORS configurado para desarrollo y producción

## 🌐 WebSockets

El sistema usa WebSockets para actualizaciones en tiempo real. El endpoint es:
- `WS /api/ws/table_sessions/{session_id}` - Conexión WebSocket para tiempo real

### Mensajes del Servidor (Incoming)

- `session_state`: Estado completo de la sesión (participantes, ítems, asignaciones)
- `item_assigned`: Ítem asignado a un participante
- `assignment_updated`: Asignación actualizada
- `assignment_removed`: Asignación eliminada
- `participant_joined`: Nuevo participante se unió
- `participant_left`: Participante abandonó la sesión
- `summary_updated`: Resumen de pagos actualizado
- `selectable_participants`: Participantes disponibles para asignar ítem
- `paying_for_participants`: Participantes por los que se está pagando
- `assignments_validated`: Validación de asignaciones
- `session_finalized`: Sesión finalizada
- `session_locked`: Sesión bloqueada
- `session_unlocked`: Sesión desbloqueada
- `error`: Mensaje de error

### Mensajes del Cliente (Outgoing)

- `join_session`: Unirse a la sesión
- `assign_item`: Asignar ítem a participante
- `update_assignment`: Actualizar asignación
- `remove_assignment`: Eliminar asignación
- `get_selectable_participants`: Obtener participantes disponibles
- `get_paying_for_participants`: Obtener participantes por los que se paga
- `request_summary`: Solicitar resumen de pagos
- `validate_assignments`: Validar asignaciones
- `finalize_session`: Finalizar sesión
- `unlock_session`: Desbloquear sesión

## 💳 Integración de Pagos

### Transbank

El sistema está integrado con Transbank Webpay Plus para recargas de wallet:

1. El usuario solicita una recarga
2. Se crea una transacción en Transbank
3. El usuario completa el pago
4. El wallet se actualiza automáticamente

**Nota**: En modo integración, los pagos se simulan automáticamente. Para producción, configura las credenciales reales de Transbank.

## 📱 Notificaciones Push

El sistema soporta notificaciones push mediante Expo Notifications:

1. Los usuarios pueden registrar su token de notificaciones
2. Los recordatorios de pago pueden enviar notificaciones push
3. Las notificaciones se envían cuando un acreedor solicita un recordatorio de pago

**Configuración**: Las notificaciones push requieren configuración adicional en Expo para producción.

## 🧪 Desarrollo

### Estructura del Backend

```
backend/backend/
├── api/
│   ├── routers/          # Endpoints de la API
│   ├── websocket/        # Manejo de WebSockets
│   └── deps.py           # Dependencias (DB, auth)
├── core/
│   ├── config.py         # Configuración
│   ├── oauth.py          # OAuth2
│   └── security.py       # JWT y seguridad
├── crud/                 # Operaciones de base de datos
├── models/               # Modelos SQLModel
├── schemas/              # Schemas Pydantic
└── main.py              # Aplicación FastAPI
```

### Estructura del Frontend

```
frontend/frontend/
├── app/                  # Rutas (Expo Router)
│   ├── (tabs)/          # Pestañas principales
│   │   ├── home.tsx     # Inicio
│   │   ├── scan.tsx     # Escanear QR
│   │   ├── wallet.tsx   # Wallet
│   │   └── settings.tsx # Configuración
│   ├── groups/          # Grupos
│   │   ├── [id].tsx     # Detalle de grupo
│   └── groups.tsx       # Lista de grupos
│   ├── invoices/        # Facturas
│   │   ├── [id].tsx     # Detalle de factura
│   └── invoices.tsx     # Lista de facturas
│   ├── reminders.tsx    # Recordatorios
│   ├── settlements.tsx  # Liquidaciones
│   ├── login.tsx        # Login
│   ├── register.tsx     # Registro
│   └── index.tsx        # Redirección inicial
├── components/           # Componentes UI
│   ├── ui/              # Componentes de Gluestack UI
│   └── SendReminderModal.tsx
├── services/             # Servicios
│   ├── api.ts           # Cliente API REST
│   ├── websocket.ts      # Cliente WebSocket
│   └── notifications.ts  # Notificaciones push
└── hooks/                # Custom hooks
```

## 📝 Scripts Útiles

### Backend

```bash
# Crear sesión y generar su QR
uv run python create_session_qr.py

# Crear restaurante y mesa
uv run python create_restaurant_table.py
```

### Frontend

```bash
# Iniciar en modo desarrollo
npm start

# Iniciar en Android
npm run android

# Iniciar en iOS
npm run ios

# Iniciar en web
npm run web

# Linter
npm run lint
```

## 🐛 Troubleshooting

### Backend no accesible desde móvil
- Asegúrate de usar `--host 0.0.0.0`
- Verifica que el firewall permita conexiones en el puerto 8000
- Usa la IP local de tu máquina, no `localhost`

### WebSocket no conecta
- Verifica que la URL del WebSocket sea correcta (ws:// o wss://)
- Revisa los logs del backend para errores
- Asegúrate de que el session_id sea válido

### Error de autenticación
- Verifica que el token JWT sea válido
- Revisa que las credenciales de Google OAuth estén correctas
- Asegúrate de que el SECRET_KEY esté configurado

### Notificaciones push no funcionan
- Verifica que el token de notificaciones esté registrado en el backend
- Asegúrate de que Expo Notifications esté configurado correctamente
- En desarrollo, las notificaciones pueden requerir configuración adicional

## 📄 Licencia

Este proyecto es privado y de uso interno.

## 👥 Contribución

Para contribuir al proyecto:

1. Crea una rama desde `main`
2. Realiza tus cambios
3. Crea un Pull Request
4. Espera la revisión y aprobación

## 📞 Soporte

Para problemas o preguntas, contacta al equipo de desarrollo.

---

**Desarrollado con ❤️ por Isaias y Josué Venegas Almonacid**

