--
-- PostgreSQL database dump
--

\restrict Nf4RnyD6weZXudTQVGUyXULrq1cgH0uLIstTD0wUWLWvNGsgpZbelUWzifZY68Q

-- Dumped from database version 15.18
-- Dumped by pg_dump version 15.18

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: shifterz
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO shifterz;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: shifterz
--

COMMENT ON SCHEMA public IS '';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: AdditionalWork; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."AdditionalWork" (
    id text NOT NULL,
    "jobId" text NOT NULL,
    description text NOT NULL,
    "estimatedCost" double precision NOT NULL,
    status text DEFAULT 'Pending'::text NOT NULL,
    "requestedById" text,
    "requestedBy" text,
    "approvedById" text,
    "approvedBy" text,
    "approvedAt" timestamp(3) without time zone,
    "rejectedAt" timestamp(3) without time zone,
    "rejectionNote" text,
    "customerApproved" boolean DEFAULT false NOT NULL,
    "franchiseId" text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."AdditionalWork" OWNER TO shifterz;

--
-- Name: Appointment; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."Appointment" (
    id text NOT NULL,
    "customerId" text,
    "customerName" text NOT NULL,
    vehicle text NOT NULL,
    service text NOT NULL,
    status text NOT NULL,
    "franchiseId" text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "scheduledDate" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "assignedStaff" text,
    "assignedStaffId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Appointment" OWNER TO shifterz;

--
-- Name: Approval; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."Approval" (
    id text NOT NULL,
    module text NOT NULL,
    "targetId" text NOT NULL,
    "requesterId" text NOT NULL,
    "requesterName" text NOT NULL,
    "approverId" text,
    "approverName" text,
    status text DEFAULT 'Pending'::text NOT NULL,
    payload jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Approval" OWNER TO shifterz;

--
-- Name: Attendance; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."Attendance" (
    id text NOT NULL,
    "employeeId" text NOT NULL,
    status text NOT NULL,
    "franchiseId" text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    date timestamp(3) without time zone NOT NULL,
    "clockIn" timestamp(3) without time zone,
    "clockOut" timestamp(3) without time zone,
    "deletedAt" timestamp(3) without time zone,
    "earlyDeparture" boolean DEFAULT false,
    "lateArrival" boolean DEFAULT false,
    "workingHours" double precision
);


ALTER TABLE public."Attendance" OWNER TO shifterz;

--
-- Name: AuditLog; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."AuditLog" (
    id text NOT NULL,
    module text NOT NULL,
    "recordId" text NOT NULL,
    action text NOT NULL,
    "userId" text NOT NULL,
    "branchId" text,
    "oldValue" jsonb,
    "newValue" jsonb,
    "ipAddress" text,
    device text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."AuditLog" OWNER TO shifterz;

--
-- Name: CalendarEvent; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."CalendarEvent" (
    id text NOT NULL,
    title text NOT NULL,
    description text,
    start timestamp(3) without time zone NOT NULL,
    "end" timestamp(3) without time zone NOT NULL,
    type text NOT NULL,
    "franchiseId" text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."CalendarEvent" OWNER TO shifterz;

--
-- Name: Callback; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."Callback" (
    id text NOT NULL,
    "leadId" text,
    "leadName" text,
    "customerId" text,
    "customerName" text,
    "scheduledAt" timestamp(3) without time zone NOT NULL,
    "reminderNotes" text NOT NULL,
    "assignedToId" text NOT NULL,
    "assignedTo" text NOT NULL,
    status text DEFAULT 'Pending'::text NOT NULL,
    "rescheduledTo" timestamp(3) without time zone,
    "completedAt" timestamp(3) without time zone,
    "completedBy" text,
    "completedNotes" text,
    "franchiseId" text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdBy" text
);


ALTER TABLE public."Callback" OWNER TO shifterz;

--
-- Name: CarIn; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."CarIn" (
    id text NOT NULL,
    vehicle text NOT NULL,
    model text NOT NULL,
    customer text NOT NULL,
    phone text NOT NULL,
    service text NOT NULL,
    status text NOT NULL,
    odometer text NOT NULL,
    notes text NOT NULL,
    "jobCardId" text NOT NULL,
    "franchiseId" text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "inTime" timestamp(3) without time zone NOT NULL,
    "outTime" timestamp(3) without time zone,
    "deletedAt" timestamp(3) without time zone,
    "accessoriesReceived" text,
    "brokenParts" text,
    "checkOutAt" timestamp(3) without time zone,
    "checkOutById" text,
    "checkOutByName" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "customerAcknowledgement" text,
    dents text,
    "expectedDelivery" timestamp(3) without time zone,
    "fuelLevel" text,
    "glassDamage" text,
    "hasDashCam" boolean DEFAULT false NOT NULL,
    "hasFastag" boolean DEFAULT false NOT NULL,
    "hasFloorMats" boolean DEFAULT false NOT NULL,
    "hasJack" boolean DEFAULT false NOT NULL,
    "hasSpareWheel" boolean DEFAULT false NOT NULL,
    "hasToolkit" boolean DEFAULT false NOT NULL,
    "hasUsbCharger" boolean DEFAULT false NOT NULL,
    "interiorCondition" text,
    "keyCount" integer DEFAULT 1,
    "otherAccessories" text,
    "photoDamages" text[] DEFAULT ARRAY[]::text[],
    "photoDashboard" text,
    "photoFront" text,
    "photoLeft" text,
    "photoOdometer" text,
    "photoRear" text,
    "photoRight" text,
    "receivedById" text,
    "receivedByName" text,
    remarks text,
    scratches text,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "wheelDamage" text
);


ALTER TABLE public."CarIn" OWNER TO shifterz;

--
-- Name: CreditNote; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."CreditNote" (
    id text NOT NULL,
    number text NOT NULL,
    date timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "franchiseId" text,
    "originalInvoiceId" text NOT NULL,
    "customerId" text,
    reason text NOT NULL,
    "taxableAmount" double precision NOT NULL,
    cgst double precision DEFAULT 0 NOT NULL,
    sgst double precision DEFAULT 0 NOT NULL,
    igst double precision DEFAULT 0 NOT NULL,
    cess double precision DEFAULT 0 NOT NULL,
    "totalTax" double precision NOT NULL,
    "totalAmount" double precision NOT NULL,
    status text DEFAULT 'Issued'::text NOT NULL,
    "createdBy" text,
    "linkedPaymentId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."CreditNote" OWNER TO shifterz;

--
-- Name: CreditNoteLine; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."CreditNoteLine" (
    id text NOT NULL,
    "creditNoteId" text NOT NULL,
    description text NOT NULL,
    "hsnSac" text,
    quantity double precision DEFAULT 1 NOT NULL,
    rate double precision NOT NULL,
    "taxableAmount" double precision NOT NULL,
    "gstRate" double precision NOT NULL,
    cgst double precision DEFAULT 0 NOT NULL,
    sgst double precision DEFAULT 0 NOT NULL,
    igst double precision DEFAULT 0 NOT NULL,
    cess double precision DEFAULT 0 NOT NULL,
    "lineTotal" double precision NOT NULL
);


ALTER TABLE public."CreditNoteLine" OWNER TO shifterz;

--
-- Name: Customer; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."Customer" (
    id text NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    email text NOT NULL,
    vehicle text NOT NULL,
    model text NOT NULL,
    visits integer NOT NULL,
    "totalSpend" double precision NOT NULL,
    "franchiseId" text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "lastVisit" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    address text,
    "alternateNumber" text,
    anniversary timestamp(3) without time zone,
    city text,
    "convertedAt" timestamp(3) without time zone,
    "convertedLeadId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    dob timestamp(3) without time zone,
    "gstNumber" text,
    "pinCode" text,
    "rewardPoints" integer DEFAULT 0 NOT NULL,
    state text,
    status text DEFAULT 'Active'::text NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "vehicleMake" text,
    "vehicleModel" text
);


ALTER TABLE public."Customer" OWNER TO shifterz;

--
-- Name: CustomerComplaint; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."CustomerComplaint" (
    id text NOT NULL,
    "customerId" text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    status text DEFAULT 'Open'::text NOT NULL,
    severity text DEFAULT 'Medium'::text NOT NULL,
    "jobId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."CustomerComplaint" OWNER TO shifterz;

--
-- Name: CustomerVehicle; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."CustomerVehicle" (
    id text NOT NULL,
    "customerId" text NOT NULL,
    "vehicleNo" text NOT NULL,
    make text NOT NULL,
    model text NOT NULL,
    variant text,
    year integer,
    "fuelType" text,
    color text,
    "chassisNo" text,
    "engineNo" text,
    odometer integer,
    vin text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."CustomerVehicle" OWNER TO shifterz;

--
-- Name: DashboardWidgetConfig; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."DashboardWidgetConfig" (
    id text NOT NULL,
    "dashboardType" text NOT NULL,
    "widgetKey" text NOT NULL,
    visible boolean DEFAULT true NOT NULL,
    "order" integer DEFAULT 0 NOT NULL,
    "updatedBy" text,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."DashboardWidgetConfig" OWNER TO shifterz;

--
-- Name: DebitNote; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."DebitNote" (
    id text NOT NULL,
    number text NOT NULL,
    date timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "franchiseId" text,
    "originalInvoiceId" text NOT NULL,
    "customerId" text,
    reason text NOT NULL,
    "taxableAmount" double precision NOT NULL,
    cgst double precision DEFAULT 0 NOT NULL,
    sgst double precision DEFAULT 0 NOT NULL,
    igst double precision DEFAULT 0 NOT NULL,
    cess double precision DEFAULT 0 NOT NULL,
    "totalTax" double precision NOT NULL,
    "totalAmount" double precision NOT NULL,
    status text DEFAULT 'Issued'::text NOT NULL,
    "createdBy" text,
    "linkedPaymentId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."DebitNote" OWNER TO shifterz;

--
-- Name: DebitNoteLine; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."DebitNoteLine" (
    id text NOT NULL,
    "debitNoteId" text NOT NULL,
    description text NOT NULL,
    "hsnSac" text,
    quantity double precision DEFAULT 1 NOT NULL,
    rate double precision NOT NULL,
    "taxableAmount" double precision NOT NULL,
    "gstRate" double precision NOT NULL,
    cgst double precision DEFAULT 0 NOT NULL,
    sgst double precision DEFAULT 0 NOT NULL,
    igst double precision DEFAULT 0 NOT NULL,
    cess double precision DEFAULT 0 NOT NULL,
    "lineTotal" double precision NOT NULL
);


ALTER TABLE public."DebitNoteLine" OWNER TO shifterz;

--
-- Name: DiscountMaster; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."DiscountMaster" (
    id text NOT NULL,
    name text NOT NULL,
    percentage double precision NOT NULL,
    "maxDiscount" double precision NOT NULL,
    "franchiseId" text,
    status text DEFAULT 'Active'::text NOT NULL
);


ALTER TABLE public."DiscountMaster" OWNER TO shifterz;

--
-- Name: Employee; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."Employee" (
    id text NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    status text DEFAULT 'Active'::text NOT NULL,
    username text,
    password text,
    role text DEFAULT 'TECHNICIAN'::text NOT NULL,
    "hqControlled" boolean DEFAULT false NOT NULL,
    "franchiseId" text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    department text,
    designation text,
    dob timestamp(3) without time zone,
    doj timestamp(3) without time zone,
    gender text,
    "reportingManager" text,
    "approvalStatus" text DEFAULT 'Approved'::text NOT NULL
);


ALTER TABLE public."Employee" OWNER TO shifterz;

--
-- Name: Estimate; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."Estimate" (
    id text NOT NULL,
    "customerId" text,
    "customerName" text NOT NULL,
    phone text NOT NULL,
    vehicle text NOT NULL,
    model text NOT NULL,
    amount double precision NOT NULL,
    status text DEFAULT 'Pending'::text NOT NULL,
    date timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    items jsonb,
    "estimatedDelivery" timestamp(3) without time zone,
    warranty text,
    "franchiseId" text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Estimate" OWNER TO shifterz;

--
-- Name: Franchise; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."Franchise" (
    id text NOT NULL,
    name text NOT NULL,
    city text NOT NULL,
    owner text NOT NULL,
    phone text NOT NULL,
    revenue double precision NOT NULL,
    jobs integer NOT NULL,
    "royaltyPct" double precision NOT NULL,
    status text NOT NULL,
    "businessName" text,
    "gstNumber" text,
    email text,
    address text,
    state text,
    "pinCode" text,
    "licenseStatus" text DEFAULT 'Active'::text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    since timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "canTransferLeads" boolean DEFAULT false NOT NULL,
    "gstRegistrationType" text
);


ALTER TABLE public."Franchise" OWNER TO shifterz;

--
-- Name: GstTransaction; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."GstTransaction" (
    id text NOT NULL,
    "franchiseId" text,
    "documentType" text NOT NULL,
    "documentId" text NOT NULL,
    "documentNumber" text NOT NULL,
    "documentDate" timestamp(3) without time zone NOT NULL,
    "returnPeriod" text NOT NULL,
    "sellerGstin" text,
    "buyerGstin" text,
    "buyerName" text,
    "sellerState" text,
    "placeOfSupply" text,
    "supplyType" text,
    "hsnSac" text,
    "gstRate" double precision,
    "taxableValue" double precision NOT NULL,
    cgst double precision DEFAULT 0 NOT NULL,
    sgst double precision DEFAULT 0 NOT NULL,
    igst double precision DEFAULT 0 NOT NULL,
    cess double precision DEFAULT 0 NOT NULL,
    "itcEligible" boolean,
    status text DEFAULT 'Active'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."GstTransaction" OWNER TO shifterz;

--
-- Name: HsnSacMaster; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."HsnSacMaster" (
    id text NOT NULL,
    code text NOT NULL,
    description text NOT NULL,
    type text NOT NULL,
    "defaultGstRate" double precision,
    status text DEFAULT 'Active'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."HsnSacMaster" OWNER TO shifterz;

--
-- Name: Inventory; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."Inventory" (
    id text NOT NULL,
    name text NOT NULL,
    unit text NOT NULL,
    category text NOT NULL,
    stock integer NOT NULL,
    reorder integer NOT NULL,
    cost double precision NOT NULL,
    supplier text NOT NULL,
    location text NOT NULL,
    "franchiseId" text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "deletedAt" timestamp(3) without time zone
);


ALTER TABLE public."Inventory" OWNER TO shifterz;

--
-- Name: InventoryAdjustmentRequest; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."InventoryAdjustmentRequest" (
    id text NOT NULL,
    "itemId" text NOT NULL,
    "requestedQty" integer NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'Pending'::text NOT NULL,
    "requestedById" text,
    "requestedBy" text,
    "approvedById" text,
    "approvedBy" text,
    "approvedAt" timestamp(3) without time zone,
    "rejectionNote" text,
    "franchiseId" text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."InventoryAdjustmentRequest" OWNER TO shifterz;

--
-- Name: InventoryMovement; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."InventoryMovement" (
    id text NOT NULL,
    "itemId" text NOT NULL,
    type text NOT NULL,
    reference text NOT NULL,
    quantity integer NOT NULL,
    balance integer NOT NULL,
    "performedBy" text NOT NULL,
    "performedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "franchiseId" text
);


ALTER TABLE public."InventoryMovement" OWNER TO shifterz;

--
-- Name: InventoryRequest; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."InventoryRequest" (
    id text NOT NULL,
    "itemId" text NOT NULL,
    "quantityRequested" integer NOT NULL,
    status text NOT NULL,
    "franchiseId" text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    date timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    priority text DEFAULT 'Medium'::text,
    "quantityApproved" integer,
    remarks text,
    "requiredDate" timestamp(3) without time zone,
    "requestedBy" text,
    "requestedById" text
);


ALTER TABLE public."InventoryRequest" OWNER TO shifterz;

--
-- Name: Invoice; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."Invoice" (
    id text NOT NULL,
    type text NOT NULL,
    client text NOT NULL,
    phone text NOT NULL,
    vehicle text NOT NULL,
    service text NOT NULL,
    amount double precision NOT NULL,
    gst double precision NOT NULL,
    discount double precision NOT NULL,
    status text NOT NULL,
    notes text NOT NULL,
    "gstNumber" text,
    items jsonb,
    "bankDetails" text,
    "paymentTerms" text,
    "deliveryTerms" text,
    "authorizedSignatory" text,
    "franchiseId" text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "approvedBy" text,
    "cancelledBy" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdBy" text,
    "modifiedBy" text,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date timestamp(3) without time zone NOT NULL,
    "dueDate" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "cancelReason" text,
    "discountReason" text,
    "jobId" text,
    "numberPrefix" text,
    "sequenceNumber" integer,
    warranty text,
    "buyerState" text,
    cess double precision,
    cgst double precision,
    "gstCalculationMeta" jsonb,
    "hsnSac" text,
    igst double precision,
    "placeOfSupply" text,
    "sellerGstin" text,
    "sellerState" text,
    sgst double precision,
    "supplyType" text,
    "taxableAmount" double precision
);


ALTER TABLE public."Invoice" OWNER TO shifterz;

--
-- Name: InvoiceLine; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."InvoiceLine" (
    id text NOT NULL,
    "invoiceId" text NOT NULL,
    "serviceId" text,
    description text NOT NULL,
    quantity double precision DEFAULT 1 NOT NULL,
    "unitPrice" double precision NOT NULL,
    discount double precision DEFAULT 0 NOT NULL,
    "hsnSac" text,
    "gstRate" double precision NOT NULL,
    "taxableAmount" double precision NOT NULL,
    cgst double precision DEFAULT 0 NOT NULL,
    sgst double precision DEFAULT 0 NOT NULL,
    igst double precision DEFAULT 0 NOT NULL,
    cess double precision DEFAULT 0 NOT NULL,
    "lineTotal" double precision NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."InvoiceLine" OWNER TO shifterz;

--
-- Name: InvoiceSequence; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."InvoiceSequence" (
    prefix text NOT NULL,
    counter integer DEFAULT 0 NOT NULL
);


ALTER TABLE public."InvoiceSequence" OWNER TO shifterz;

--
-- Name: Job; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."Job" (
    id text NOT NULL,
    vehicle text NOT NULL,
    customer text NOT NULL,
    service text NOT NULL,
    technician text NOT NULL,
    status text NOT NULL,
    priority text NOT NULL,
    notes text NOT NULL,
    photos text[],
    "technicianId" text,
    "franchiseId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "startDate" timestamp(3) without time zone NOT NULL,
    "estCompletion" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "actualCompletion" timestamp(3) without time zone,
    "assignedBy" text,
    "assignedByRole" text,
    "assignmentLocked" boolean DEFAULT false NOT NULL,
    "carInId" text,
    "checkInPhotos" text[] DEFAULT ARRAY[]::text[],
    checklist jsonb,
    "companyAcknowledgement" text,
    "completionPhotos" text[] DEFAULT ARRAY[]::text[],
    "customerSignature" text,
    "failedAt" timestamp(3) without time zone,
    "inspectionDetails" jsonb,
    "internalRemarks" text,
    "isRework" boolean DEFAULT false NOT NULL,
    "passedAt" timestamp(3) without time zone,
    "qcAttemptCount" integer DEFAULT 0 NOT NULL,
    "qcBy" text,
    "qcById" text,
    "qcNotes" text,
    "qcPhotos" text[] DEFAULT ARRAY[]::text[],
    remarks text,
    "reworkCount" integer DEFAULT 0 NOT NULL,
    "serviceAdvisor" text,
    "serviceAdvisorId" text,
    services jsonb,
    "supportingTechnicianIds" text[] DEFAULT ARRAY[]::text[],
    "technicianInstructions" text,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "workProgressPhotos" text[] DEFAULT ARRAY[]::text[]
);


ALTER TABLE public."Job" OWNER TO shifterz;

--
-- Name: JobHistory; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."JobHistory" (
    id text NOT NULL,
    "jobId" text NOT NULL,
    event text NOT NULL,
    "performedBy" text NOT NULL,
    payload jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."JobHistory" OWNER TO shifterz;

--
-- Name: JobPhoto; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."JobPhoto" (
    id text NOT NULL,
    "jobId" text NOT NULL,
    url text NOT NULL,
    category text NOT NULL,
    caption text,
    "uploadedById" text,
    "uploadedBy" text,
    "franchiseId" text,
    "qcInspectionId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."JobPhoto" OWNER TO shifterz;

--
-- Name: Lead; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."Lead" (
    id text NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    email text NOT NULL,
    source text NOT NULL,
    service text NOT NULL,
    vehicle text NOT NULL,
    "assignedTo" text NOT NULL,
    status text NOT NULL,
    notes text NOT NULL,
    budget text NOT NULL,
    "franchiseId" text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    date timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "alternateNumber" text,
    "assignedAt" timestamp(3) without time zone,
    "assignedBy" text,
    "assignedToId" text,
    city text,
    "convertedAt" timestamp(3) without time zone,
    "customerId" text,
    "lostReason" text,
    "originalFranchiseId" text,
    priority text DEFAULT 'Medium'::text,
    "vehicleMake" text,
    "vehicleModel" text
);


ALTER TABLE public."Lead" OWNER TO shifterz;

--
-- Name: LeadAssignmentHistory; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."LeadAssignmentHistory" (
    id text NOT NULL,
    "leadId" text NOT NULL,
    "assignedTo" text NOT NULL,
    "assignedToId" text,
    "assignedBy" text NOT NULL,
    "assignedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    reason text
);


ALTER TABLE public."LeadAssignmentHistory" OWNER TO shifterz;

--
-- Name: LeadFollowUp; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."LeadFollowUp" (
    id text NOT NULL,
    "leadId" text NOT NULL,
    "followUpDate" timestamp(3) without time zone NOT NULL,
    "performedById" text,
    "performedBy" text NOT NULL,
    mode text NOT NULL,
    notes text NOT NULL,
    outcome text,
    "nextAction" text,
    "nextFollowUpDate" timestamp(3) without time zone,
    "leadStatusUpdate" text,
    "franchiseId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."LeadFollowUp" OWNER TO shifterz;

--
-- Name: LeadTransferHistory; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."LeadTransferHistory" (
    id text NOT NULL,
    "leadId" text NOT NULL,
    "fromFranchiseId" text,
    "fromFranchiseName" text,
    "toFranchiseId" text,
    "toFranchiseName" text,
    "transferredBy" text NOT NULL,
    "transferredAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    reason text
);


ALTER TABLE public."LeadTransferHistory" OWNER TO shifterz;

--
-- Name: LeaveRequest; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."LeaveRequest" (
    id text NOT NULL,
    "employeeId" text NOT NULL,
    "startDate" timestamp(3) without time zone NOT NULL,
    "endDate" timestamp(3) without time zone NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'Pending'::text NOT NULL,
    "franchiseId" text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."LeaveRequest" OWNER TO shifterz;

--
-- Name: License; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."License" (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "licenseKey" text NOT NULL,
    status text DEFAULT 'Active'::text NOT NULL,
    "maxSuperAdmins" integer DEFAULT 1 NOT NULL,
    "maxHQUsers" integer DEFAULT 6 NOT NULL,
    "maxFranchiseAdmins" integer DEFAULT 1 NOT NULL,
    "maxFranchiseUsers" integer DEFAULT 6 NOT NULL,
    "activatedBy" text,
    "activatedAt" timestamp(3) without time zone,
    "expiryDate" timestamp(3) without time zone NOT NULL,
    features text[]
);


ALTER TABLE public."License" OWNER TO shifterz;

--
-- Name: MasterData; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."MasterData" (
    id text NOT NULL,
    category text NOT NULL,
    code text,
    name text NOT NULL,
    value text,
    "parentId" text,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'Active'::text NOT NULL,
    "createdBy" text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."MasterData" OWNER TO shifterz;

--
-- Name: MaterialConsumption; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."MaterialConsumption" (
    id text NOT NULL,
    "jobId" text NOT NULL,
    "itemId" text NOT NULL,
    "itemName" text NOT NULL,
    quantity double precision NOT NULL,
    unit text,
    status text DEFAULT 'Pending'::text NOT NULL,
    "recordedById" text,
    "recordedBy" text,
    "approvedById" text,
    "approvedBy" text,
    "approvedAt" timestamp(3) without time zone,
    "rejectionNote" text,
    "franchiseId" text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."MaterialConsumption" OWNER TO shifterz;

--
-- Name: MemberTransferRequest; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."MemberTransferRequest" (
    id text NOT NULL,
    "employeeId" text,
    "fromFranchiseId" text,
    "toFranchiseId" text,
    "requestedBy" text NOT NULL,
    status text NOT NULL,
    username text,
    password text,
    "newMemberName" text,
    "newMemberPhone" text,
    "newMemberEmail" text,
    role text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    date timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone
);


ALTER TABLE public."MemberTransferRequest" OWNER TO shifterz;

--
-- Name: Notification; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."Notification" (
    id text NOT NULL,
    "userId" text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    read boolean DEFAULT false NOT NULL,
    type text,
    link text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Notification" OWNER TO shifterz;

--
-- Name: OutPass; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."OutPass" (
    id text NOT NULL,
    vehicle text NOT NULL,
    model text NOT NULL,
    customer text NOT NULL,
    phone text NOT NULL,
    service text NOT NULL,
    "securityName" text NOT NULL,
    "technicianName" text NOT NULL,
    remarks text NOT NULL,
    issued boolean NOT NULL,
    "carInId" text NOT NULL,
    "franchiseId" text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "outTime" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "approvedAt" timestamp(3) without time zone,
    "approvedBy" text,
    status text DEFAULT 'Pending'::text NOT NULL,
    "createdBy" text,
    "invoiceId" text,
    "jobCardId" text,
    "paymentStatus" text
);


ALTER TABLE public."OutPass" OWNER TO shifterz;

--
-- Name: Payment; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."Payment" (
    id text NOT NULL,
    "invoiceId" text,
    client text NOT NULL,
    amount double precision NOT NULL,
    mode text NOT NULL,
    ref text,
    notes text,
    "franchiseId" text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdBy" text,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "approvedBy" text,
    "customerId" text,
    "jobId" text,
    "multipleModes" jsonb,
    "originalReceiptRef" text,
    "outstandingBalance" double precision,
    "receiptNumber" text,
    "refundReason" text,
    type text DEFAULT 'Full Payment'::text NOT NULL
);


ALTER TABLE public."Payment" OWNER TO shifterz;

--
-- Name: PriceMaster; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."PriceMaster" (
    id text NOT NULL,
    "itemType" text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    price double precision NOT NULL,
    "franchiseId" text,
    status text DEFAULT 'Active'::text NOT NULL
);


ALTER TABLE public."PriceMaster" OWNER TO shifterz;

--
-- Name: PurchaseOrder; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."PurchaseOrder" (
    id text NOT NULL,
    "orderNumber" text NOT NULL,
    "vendorId" text NOT NULL,
    "vendorName" text NOT NULL,
    stage text DEFAULT 'REQUESTED'::text NOT NULL,
    items text NOT NULL,
    "totalAmount" double precision NOT NULL,
    "paidAmount" double precision DEFAULT 0 NOT NULL,
    "invoiceNumber" text,
    "receivedAt" timestamp(3) without time zone,
    "paidAt" timestamp(3) without time zone,
    notes text,
    "createdBy" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    cess double precision,
    cgst double precision,
    "hsnSac" text,
    igst double precision,
    "invoiceDate" timestamp(3) without time zone,
    "itcClaimed" boolean DEFAULT false NOT NULL,
    "itcEligible" boolean,
    "placeOfSupply" text,
    sgst double precision,
    "supplyType" text,
    "taxableValue" double precision,
    "vendorGstin" text,
    "vendorState" text
);


ALTER TABLE public."PurchaseOrder" OWNER TO shifterz;

--
-- Name: PurchaseOrderLine; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."PurchaseOrderLine" (
    id text NOT NULL,
    "purchaseOrderId" text NOT NULL,
    description text NOT NULL,
    sku text,
    "hsnSac" text,
    quantity double precision DEFAULT 1 NOT NULL,
    "unitPrice" double precision NOT NULL,
    "taxableAmount" double precision NOT NULL,
    "gstRate" double precision NOT NULL,
    cgst double precision DEFAULT 0 NOT NULL,
    sgst double precision DEFAULT 0 NOT NULL,
    igst double precision DEFAULT 0 NOT NULL,
    cess double precision DEFAULT 0 NOT NULL,
    "lineTotal" double precision NOT NULL,
    "itcEligible" boolean DEFAULT false NOT NULL
);


ALTER TABLE public."PurchaseOrderLine" OWNER TO shifterz;

--
-- Name: QCChecklistTemplate; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."QCChecklistTemplate" (
    id text NOT NULL,
    category text NOT NULL,
    label text NOT NULL,
    "order" integer NOT NULL,
    "isDefault" boolean DEFAULT false NOT NULL,
    "franchiseId" text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."QCChecklistTemplate" OWNER TO shifterz;

--
-- Name: QCInspection; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."QCInspection" (
    id text NOT NULL,
    "jobId" text NOT NULL,
    "attemptNumber" integer NOT NULL,
    "inspectorId" text,
    "inspectorName" text,
    "scheduledAt" timestamp(3) without time zone,
    priority text,
    "assignRemarks" text,
    checklist jsonb,
    result text DEFAULT 'Pending'::text NOT NULL,
    reason text,
    remarks text,
    "reworkRequired" boolean DEFAULT false NOT NULL,
    "decidedAt" timestamp(3) without time zone,
    "franchiseId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."QCInspection" OWNER TO shifterz;

--
-- Name: ReceiptSequence; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."ReceiptSequence" (
    prefix text NOT NULL,
    counter integer DEFAULT 0 NOT NULL
);


ALTER TABLE public."ReceiptSequence" OWNER TO shifterz;

--
-- Name: Referral; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."Referral" (
    id text NOT NULL,
    "referringCustomerId" text NOT NULL,
    "referringCustomer" text NOT NULL,
    "referredLeadId" text,
    "referredCustomerId" text,
    "referredName" text NOT NULL,
    "referredPhone" text NOT NULL,
    "referralDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    status text DEFAULT 'Pending'::text NOT NULL,
    "rewardPointsApplied" integer DEFAULT 0 NOT NULL,
    "franchiseId" text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Referral" OWNER TO shifterz;

--
-- Name: RolePermission; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."RolePermission" (
    role text NOT NULL,
    permissions text[],
    actions text[] DEFAULT ARRAY[]::text[]
);


ALTER TABLE public."RolePermission" OWNER TO shifterz;

--
-- Name: Service; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."Service" (
    id text NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    price double precision NOT NULL,
    duration text NOT NULL,
    warranty text NOT NULL,
    "desc" text NOT NULL,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    code text,
    gst double precision DEFAULT 18 NOT NULL,
    "minPrice" double precision DEFAULT 0 NOT NULL,
    status text DEFAULT 'Active'::text NOT NULL,
    "hsnSac" text,
    "taxApplicable" boolean DEFAULT true NOT NULL
);


ALTER TABLE public."Service" OWNER TO shifterz;

--
-- Name: ServiceMaster; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."ServiceMaster" (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    "standardPrice" double precision NOT NULL,
    "estimatedTime" text NOT NULL,
    warranty text NOT NULL,
    status text DEFAULT 'Active'::text NOT NULL,
    "allowPriceEdit" boolean DEFAULT false NOT NULL
);


ALTER TABLE public."ServiceMaster" OWNER TO shifterz;

--
-- Name: ServiceReminder; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."ServiceReminder" (
    id text NOT NULL,
    "customerId" text NOT NULL,
    "vehicleNo" text NOT NULL,
    "reminderType" text NOT NULL,
    "scheduledDate" timestamp(3) without time zone NOT NULL,
    status text DEFAULT 'Pending'::text NOT NULL,
    notes text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."ServiceReminder" OWNER TO shifterz;

--
-- Name: Session; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."Session" (
    id text NOT NULL,
    "employeeId" text NOT NULL,
    jti text NOT NULL,
    "issuedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "revokedAt" timestamp(3) without time zone,
    "revokedReason" text,
    "ipAddress" text,
    device text
);


ALTER TABLE public."Session" OWNER TO shifterz;

--
-- Name: Setting; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."Setting" (
    id text DEFAULT 'default'::text NOT NULL,
    "companyName" text NOT NULL,
    address text NOT NULL,
    phone text NOT NULL,
    email text NOT NULL,
    gstin text NOT NULL,
    "gstPct" double precision NOT NULL,
    currency text NOT NULL,
    agents text[],
    categories text[],
    "securityGuards" text[],
    "isDeleted" boolean DEFAULT false NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "branchAddress" text,
    city text,
    "companyLogo" text,
    country text,
    "leadSources" text[],
    "leadStatuses" text[],
    "lostReasons" text[],
    "loyaltyProgram" jsonb,
    "notificationTemplates" jsonb,
    "numberingSeries" jsonb,
    "panNumber" text,
    "pinCode" text,
    "referralProgram" jsonb,
    "registeredAddress" text,
    state text,
    website text,
    "workingHours" jsonb
);


ALTER TABLE public."Setting" OWNER TO shifterz;

--
-- Name: TaxMaster; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."TaxMaster" (
    id text NOT NULL,
    name text NOT NULL,
    percentage double precision NOT NULL,
    "franchiseId" text,
    status text DEFAULT 'Active'::text NOT NULL,
    "effectiveFrom" timestamp(3) without time zone,
    "effectiveTo" timestamp(3) without time zone
);


ALTER TABLE public."TaxMaster" OWNER TO shifterz;

--
-- Name: UserPermission; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."UserPermission" (
    id text NOT NULL,
    "employeeId" text NOT NULL,
    modules text[],
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    actions text[] DEFAULT ARRAY[]::text[],
    "actionsOverride" boolean DEFAULT false NOT NULL
);


ALTER TABLE public."UserPermission" OWNER TO shifterz;

--
-- Name: Vendor; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."Vendor" (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    "gstNumber" text,
    contact text,
    phone text,
    email text,
    address text,
    status text DEFAULT 'Active'::text NOT NULL,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    state text
);


ALTER TABLE public."Vendor" OWNER TO shifterz;

--
-- Name: Warranty; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."Warranty" (
    id text NOT NULL,
    "customerId" text NOT NULL,
    "vehicleNo" text NOT NULL,
    "jobId" text,
    "invoiceId" text,
    "itemName" text NOT NULL,
    "durationDays" integer NOT NULL,
    "startDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expiryDate" timestamp(3) without time zone NOT NULL,
    status text DEFAULT 'Active'::text NOT NULL,
    notes text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    claims text,
    "warrantyNo" text
);


ALTER TABLE public."Warranty" OWNER TO shifterz;

--
-- Name: WorkNote; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."WorkNote" (
    id text NOT NULL,
    "jobId" text NOT NULL,
    note text NOT NULL,
    "createdById" text,
    "createdBy" text,
    "franchiseId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."WorkNote" OWNER TO shifterz;

--
-- Name: WorkflowStage; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public."WorkflowStage" (
    id text NOT NULL,
    name text NOT NULL,
    "order" integer NOT NULL,
    "isDefault" boolean DEFAULT false NOT NULL,
    "franchiseId" text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."WorkflowStage" OWNER TO shifterz;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: shifterz
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO shifterz;

--
-- Data for Name: AdditionalWork; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."AdditionalWork" (id, "jobId", description, "estimatedCost", status, "requestedById", "requestedBy", "approvedById", "approvedBy", "approvedAt", "rejectedAt", "rejectionNote", "customerApproved", "franchiseId", "isDeleted", "deletedAt", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Appointment; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."Appointment" (id, "customerId", "customerName", vehicle, service, status, "franchiseId", "isDeleted", "scheduledDate", "deletedAt", "assignedStaff", "assignedStaffId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Approval; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."Approval" (id, module, "targetId", "requesterId", "requesterName", "approverId", "approverName", status, payload, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Attendance; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."Attendance" (id, "employeeId", status, "franchiseId", "isDeleted", date, "clockIn", "clockOut", "deletedAt", "earlyDeparture", "lateArrival", "workingHours") FROM stdin;
\.


--
-- Data for Name: AuditLog; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."AuditLog" (id, module, "recordId", action, "userId", "branchId", "oldValue", "newValue", "ipAddress", device, "createdAt") FROM stdin;
cmsmrp2m40000p0vpg5h0ouvo	Login	HQ-001	SUCCESS	superadmin	\N	null	{"role": "SUPER_ADMIN", "username": "superadmin"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 05:04:50.813
cmsmrwwi90001p0vpu4135cae	Login	NONE	FAILURE	Hari	\N	{"error": "Invalid username or password"}	null	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 05:10:56.145
cmsmrx1kj0002p0vpy5xa21dw	Login	NONE	FAILURE	Hari	\N	{"error": "Invalid username or password"}	null	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 05:11:02.707
cmsmrx24p0003p0vplkqgfvnb	Login	NONE	FAILURE	Hari	\N	{"error": "Invalid username or password"}	null	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 05:11:03.433
cmsmrx2a70004p0vp03mt9git	Login	NONE	FAILURE	Hari	\N	{"error": "Invalid username or password"}	null	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 05:11:03.632
cmsmrx2e80005p0vpye7dary1	Login	NONE	FAILURE	Hari	\N	{"error": "Invalid username or password"}	null	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 05:11:03.776
cmsmrxc0g0006p0vpadspue90	Login	HQ-001	SUCCESS	superadmin	\N	null	{"role": "SUPER_ADMIN", "username": "superadmin"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 05:11:16.24
cmsmrxvs70007p0vp6qgfqs0k	Login	NONE	FAILURE	FRA001	\N	{"error": "Invalid username or password"}	null	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 05:11:41.863
cmsmrya790008p0vpit20kk66	Login	HQ-001	SUCCESS	superadmin	\N	null	{"role": "SUPER_ADMIN", "username": "superadmin"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 05:12:00.55
cmsmy1pac0000vsvp6hwvg4yf	Login	HQ-001	SUCCESS	superadmin	\N	null	{"role": "SUPER_ADMIN", "username": "superadmin"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 08:02:37.764
cmsmz19d10000jcvpdkywh09i	Login	HQ-001	SUCCESS	superadmin	\N	null	{"role": "SUPER_ADMIN", "username": "superadmin"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 08:30:16.741
cmsmz23sd0001jcvpbx7po2rv	Login	NONE	FAILURE	Hari	\N	{"error": "Invalid username or password"}	null	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 08:30:56.173
cmsmz277t0002jcvpvw69ktiy	Login	NONE	FAILURE	Hari	\N	{"error": "Invalid username or password"}	null	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 08:31:00.617
cmsmz27k90003jcvp2drho6tp	Login	NONE	FAILURE	Hari	\N	{"error": "Invalid username or password"}	null	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 08:31:01.065
cmsmz27ow0004jcvpbduwxj5m	Login	NONE	FAILURE	Hari	\N	{"error": "Invalid username or password"}	null	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 08:31:01.232
cmsmz27vk0005jcvpo8f90zhq	Login	NONE	FAILURE	Hari	\N	{"error": "Invalid username or password"}	null	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 08:31:01.472
cmsmz28100006jcvpxihmqnjo	Login	NONE	FAILURE	Hari	\N	{"error": "Invalid username or password"}	null	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 08:31:01.668
cmsmz28tt0007jcvp7fubqh2s	Login	NONE	FAILURE	Hari	\N	{"error": "Invalid username or password"}	null	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 08:31:02.705
cmsmz2v5w0008jcvpzn8q3055	Login	NONE	FAILURE	Hari	\N	{"error": "Invalid username or password"}	null	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 08:31:31.652
cmsmz2woy0009jcvp29hg5948	Login	NONE	FAILURE	Hari	\N	{"error": "Invalid username or password"}	null	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 08:31:33.634
cmsmz2wzs000ajcvp28eefl9v	Login	NONE	FAILURE	Hari	\N	{"error": "Invalid username or password"}	null	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 08:31:34.024
cmsmz2x68000bjcvpjk861vqs	Login	NONE	FAILURE	Hari	\N	{"error": "Invalid username or password"}	null	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 08:31:34.256
cmsmz2y49000cjcvp3cliystr	Login	NONE	FAILURE	Hari	\N	{"error": "Invalid username or password"}	null	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 08:31:35.481
cmsmz2yan000djcvpfl3qde73	Login	NONE	FAILURE	Hari	\N	{"error": "Invalid username or password"}	null	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 08:31:35.711
cmsmz3m4f000ejcvpkhw7x34x	Login	NONE	FAILURE	Hari	\N	{"error": "Invalid username or password"}	null	::1	Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36	2026-08-10 08:32:06.591
cmsmz7c4l0000p4vpmj3lr0jj	Login	USRMSMRWMJD	SUCCESS	hari	FRA001	null	{"role": "FRANCHISE_ADMIN", "username": "hari"}	::1	Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36	2026-08-10 08:35:00.261
cmu0u0xm400004wvpcyg8k3x8	Login	NONE	FAILURE	admin	\N	{"error": "\\nInvalid `db.employee.findUnique()` invocation in\\nC:\\\\Users\\\\Administrator\\\\Documents\\\\shifterz\\\\shifterz_backend\\\\src\\\\modules\\\\auth\\\\auth.repository.ts:10:24\\n\\n   7 \\n   8 export class AuthRepository {\\n   9   async findEmployeeByUsername(username: string) {\\n→ 10     return db.employee.findUnique(\\nThe column `Employee.approvalStatus` does not exist in the current database."}	null	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36	2026-09-14 05:58:32.237
cmu0u6roc00004svpdz0odwnn	Login	NONE	FAILURE	admin	\N	{"error": "Invalid username or password"}	null	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36	2026-09-14 06:03:04.476
cmu0u8nex00014svp6j5kj7on	Login	NONE	FAILURE	admin	\N	{"error": "Invalid username or password"}	null	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36	2026-09-14 06:04:32.265
cmu0u8xfq00024svppg7mkzwd	Login	NONE	FAILURE	superadmin	\N	{"error": "Invalid username or password"}	null	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36	2026-09-14 06:04:45.254
cmu0ugwjy00044svp9ghwurml	Login	HQ-001	SUCCESS	superadmin	\N	null	{"role": "SUPER_ADMIN", "username": "superadmin"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36	2026-09-14 06:10:57.358
cmu0uhkqi00064svp443dt604	Login	HQ-001	SUCCESS	superadmin	\N	null	{"role": "SUPER_ADMIN", "username": "superadmin"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36	2026-09-14 06:11:28.698
\.


--
-- Data for Name: CalendarEvent; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."CalendarEvent" (id, title, description, start, "end", type, "franchiseId", "isDeleted", "deletedAt", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Callback; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."Callback" (id, "leadId", "leadName", "customerId", "customerName", "scheduledAt", "reminderNotes", "assignedToId", "assignedTo", status, "rescheduledTo", "completedAt", "completedBy", "completedNotes", "franchiseId", "isDeleted", "deletedAt", "createdAt", "updatedAt", "createdBy") FROM stdin;
\.


--
-- Data for Name: CarIn; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."CarIn" (id, vehicle, model, customer, phone, service, status, odometer, notes, "jobCardId", "franchiseId", "isDeleted", "inTime", "outTime", "deletedAt", "accessoriesReceived", "brokenParts", "checkOutAt", "checkOutById", "checkOutByName", "createdAt", "customerAcknowledgement", dents, "expectedDelivery", "fuelLevel", "glassDamage", "hasDashCam", "hasFastag", "hasFloorMats", "hasJack", "hasSpareWheel", "hasToolkit", "hasUsbCharger", "interiorCondition", "keyCount", "otherAccessories", "photoDamages", "photoDashboard", "photoFront", "photoLeft", "photoOdometer", "photoRear", "photoRight", "receivedById", "receivedByName", remarks, scratches, "updatedAt", "wheelDamage") FROM stdin;
\.


--
-- Data for Name: CreditNote; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."CreditNote" (id, number, date, "franchiseId", "originalInvoiceId", "customerId", reason, "taxableAmount", cgst, sgst, igst, cess, "totalTax", "totalAmount", status, "createdBy", "linkedPaymentId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: CreditNoteLine; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."CreditNoteLine" (id, "creditNoteId", description, "hsnSac", quantity, rate, "taxableAmount", "gstRate", cgst, sgst, igst, cess, "lineTotal") FROM stdin;
\.


--
-- Data for Name: Customer; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."Customer" (id, name, phone, email, vehicle, model, visits, "totalSpend", "franchiseId", "isDeleted", "lastVisit", "deletedAt", address, "alternateNumber", anniversary, city, "convertedAt", "convertedLeadId", "createdAt", dob, "gstNumber", "pinCode", "rewardPoints", state, status, "updatedAt", "vehicleMake", "vehicleModel") FROM stdin;
\.


--
-- Data for Name: CustomerComplaint; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."CustomerComplaint" (id, "customerId", title, description, status, severity, "jobId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: CustomerVehicle; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."CustomerVehicle" (id, "customerId", "vehicleNo", make, model, variant, year, "fuelType", color, "chassisNo", "engineNo", odometer, vin, "isDeleted", "deletedAt", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: DashboardWidgetConfig; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."DashboardWidgetConfig" (id, "dashboardType", "widgetKey", visible, "order", "updatedBy", "updatedAt", "createdAt") FROM stdin;
\.


--
-- Data for Name: DebitNote; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."DebitNote" (id, number, date, "franchiseId", "originalInvoiceId", "customerId", reason, "taxableAmount", cgst, sgst, igst, cess, "totalTax", "totalAmount", status, "createdBy", "linkedPaymentId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: DebitNoteLine; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."DebitNoteLine" (id, "debitNoteId", description, "hsnSac", quantity, rate, "taxableAmount", "gstRate", cgst, sgst, igst, cess, "lineTotal") FROM stdin;
\.


--
-- Data for Name: DiscountMaster; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."DiscountMaster" (id, name, percentage, "maxDiscount", "franchiseId", status) FROM stdin;
\.


--
-- Data for Name: Employee; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."Employee" (id, name, phone, email, status, username, password, role, "hqControlled", "franchiseId", "isDeleted", "deletedAt", department, designation, dob, doj, gender, "reportingManager", "approvalStatus") FROM stdin;
USRMSMRWMJD	Hari	\N	\N	Active	hari	$2b$10$tlahpvcoax87Ieqyr/q3Uec1YRFvXpGOAAVRYOo0JUVtfGoNIxM66	FRANCHISE_ADMIN	f	FRA001	f	\N	\N	\N	\N	\N	\N	\N	Approved
USRMSMZKH6M	hari2	\N	\N	Active	hari2	$2b$10$SVShlzOEo5WblD48HtEeVu57jET5oYUY3/onupX/LlgsECppq9CpG	FRANCHISE_ADMIN	f	FRA002	f	\N	\N	\N	\N	\N	\N	\N	Approved
HQ-001	Super Admin	\N	\N	Active	superadmin	$2b$10$idQGp6eN4clA0bGjhNJHqe70R5.g5DVXyEBka2g.TZHx6PYqtzExG	SUPER_ADMIN	f	\N	f	\N	\N	\N	\N	\N	\N	\N	Approved
\.


--
-- Data for Name: Estimate; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."Estimate" (id, "customerId", "customerName", phone, vehicle, model, amount, status, date, items, "estimatedDelivery", warranty, "franchiseId", "isDeleted", "deletedAt", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Franchise; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."Franchise" (id, name, city, owner, phone, revenue, jobs, "royaltyPct", status, "businessName", "gstNumber", email, address, state, "pinCode", "licenseStatus", "isDeleted", since, "deletedAt", "canTransferLeads", "gstRegistrationType") FROM stdin;
FRA001	Hari	mayiladuthurai	Hari	9173395096	0	0	5	Active	Hari	24AAAGM0289C1ZP	harikrishnacsbs@gmail.com	west street	2	609805	Active	f	2026-08-10 00:00:00	\N	f	\N
FRA002	rf	mayiladuthurai	gr	7339509611	0	0	5	Active	gr	24AAAGM0289C1ZP	harikrishnacsbs@gmail.com	west street	2	609805	Active	f	2026-08-10 00:00:00	\N	f	\N
\.


--
-- Data for Name: GstTransaction; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."GstTransaction" (id, "franchiseId", "documentType", "documentId", "documentNumber", "documentDate", "returnPeriod", "sellerGstin", "buyerGstin", "buyerName", "sellerState", "placeOfSupply", "supplyType", "hsnSac", "gstRate", "taxableValue", cgst, sgst, igst, cess, "itcEligible", status, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: HsnSacMaster; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."HsnSacMaster" (id, code, description, type, "defaultGstRate", status, "createdAt") FROM stdin;
\.


--
-- Data for Name: Inventory; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."Inventory" (id, name, unit, category, stock, reorder, cost, supplier, location, "franchiseId", "isDeleted", "deletedAt") FROM stdin;
\.


--
-- Data for Name: InventoryAdjustmentRequest; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."InventoryAdjustmentRequest" (id, "itemId", "requestedQty", reason, status, "requestedById", "requestedBy", "approvedById", "approvedBy", "approvedAt", "rejectionNote", "franchiseId", "isDeleted", "deletedAt", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: InventoryMovement; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."InventoryMovement" (id, "itemId", type, reference, quantity, balance, "performedBy", "performedAt", "franchiseId") FROM stdin;
\.


--
-- Data for Name: InventoryRequest; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."InventoryRequest" (id, "itemId", "quantityRequested", status, "franchiseId", "isDeleted", date, "deletedAt", priority, "quantityApproved", remarks, "requiredDate", "requestedBy", "requestedById") FROM stdin;
\.


--
-- Data for Name: Invoice; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."Invoice" (id, type, client, phone, vehicle, service, amount, gst, discount, status, notes, "gstNumber", items, "bankDetails", "paymentTerms", "deliveryTerms", "authorizedSignatory", "franchiseId", "isDeleted", "approvedBy", "cancelledBy", "createdAt", "createdBy", "modifiedBy", "updatedAt", date, "dueDate", "deletedAt", "cancelReason", "discountReason", "jobId", "numberPrefix", "sequenceNumber", warranty, "buyerState", cess, cgst, "gstCalculationMeta", "hsnSac", igst, "placeOfSupply", "sellerGstin", "sellerState", sgst, "supplyType", "taxableAmount") FROM stdin;
\.


--
-- Data for Name: InvoiceLine; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."InvoiceLine" (id, "invoiceId", "serviceId", description, quantity, "unitPrice", discount, "hsnSac", "gstRate", "taxableAmount", cgst, sgst, igst, cess, "lineTotal", "createdAt") FROM stdin;
\.


--
-- Data for Name: InvoiceSequence; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."InvoiceSequence" (prefix, counter) FROM stdin;
\.


--
-- Data for Name: Job; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."Job" (id, vehicle, customer, service, technician, status, priority, notes, photos, "technicianId", "franchiseId", "createdAt", "isDeleted", "startDate", "estCompletion", "deletedAt", "actualCompletion", "assignedBy", "assignedByRole", "assignmentLocked", "carInId", "checkInPhotos", checklist, "companyAcknowledgement", "completionPhotos", "customerSignature", "failedAt", "inspectionDetails", "internalRemarks", "isRework", "passedAt", "qcAttemptCount", "qcBy", "qcById", "qcNotes", "qcPhotos", remarks, "reworkCount", "serviceAdvisor", "serviceAdvisorId", services, "supportingTechnicianIds", "technicianInstructions", "updatedAt", "workProgressPhotos") FROM stdin;
\.


--
-- Data for Name: JobHistory; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."JobHistory" (id, "jobId", event, "performedBy", payload, "createdAt") FROM stdin;
\.


--
-- Data for Name: JobPhoto; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."JobPhoto" (id, "jobId", url, category, caption, "uploadedById", "uploadedBy", "franchiseId", "qcInspectionId", "createdAt") FROM stdin;
\.


--
-- Data for Name: Lead; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."Lead" (id, name, phone, email, source, service, vehicle, "assignedTo", status, notes, budget, "franchiseId", "isDeleted", date, "deletedAt", "alternateNumber", "assignedAt", "assignedBy", "assignedToId", city, "convertedAt", "customerId", "lostReason", "originalFranchiseId", priority, "vehicleMake", "vehicleModel") FROM stdin;
\.


--
-- Data for Name: LeadAssignmentHistory; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."LeadAssignmentHistory" (id, "leadId", "assignedTo", "assignedToId", "assignedBy", "assignedAt", reason) FROM stdin;
\.


--
-- Data for Name: LeadFollowUp; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."LeadFollowUp" (id, "leadId", "followUpDate", "performedById", "performedBy", mode, notes, outcome, "nextAction", "nextFollowUpDate", "leadStatusUpdate", "franchiseId", "createdAt") FROM stdin;
\.


--
-- Data for Name: LeadTransferHistory; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."LeadTransferHistory" (id, "leadId", "fromFranchiseId", "fromFranchiseName", "toFranchiseId", "toFranchiseName", "transferredBy", "transferredAt", reason) FROM stdin;
\.


--
-- Data for Name: LeaveRequest; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."LeaveRequest" (id, "employeeId", "startDate", "endDate", reason, status, "franchiseId", "isDeleted", "deletedAt", "createdAt") FROM stdin;
\.


--
-- Data for Name: License; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."License" (id, "organizationId", "licenseKey", status, "maxSuperAdmins", "maxHQUsers", "maxFranchiseAdmins", "maxFranchiseUsers", "activatedBy", "activatedAt", "expiryDate", features) FROM stdin;
\.


--
-- Data for Name: MasterData; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."MasterData" (id, category, code, name, value, "parentId", "sortOrder", status, "createdBy", "isDeleted", "deletedAt", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: MaterialConsumption; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."MaterialConsumption" (id, "jobId", "itemId", "itemName", quantity, unit, status, "recordedById", "recordedBy", "approvedById", "approvedBy", "approvedAt", "rejectionNote", "franchiseId", "isDeleted", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: MemberTransferRequest; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."MemberTransferRequest" (id, "employeeId", "fromFranchiseId", "toFranchiseId", "requestedBy", status, username, password, "newMemberName", "newMemberPhone", "newMemberEmail", role, "isDeleted", "createdAt", "updatedAt", date, "deletedAt") FROM stdin;
\.


--
-- Data for Name: Notification; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."Notification" (id, "userId", title, message, read, type, link, "createdAt") FROM stdin;
\.


--
-- Data for Name: OutPass; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."OutPass" (id, vehicle, model, customer, phone, service, "securityName", "technicianName", remarks, issued, "carInId", "franchiseId", "isDeleted", "outTime", "deletedAt", "approvedAt", "approvedBy", status, "createdBy", "invoiceId", "jobCardId", "paymentStatus") FROM stdin;
\.


--
-- Data for Name: Payment; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."Payment" (id, "invoiceId", client, amount, mode, ref, notes, "franchiseId", "isDeleted", "createdAt", "createdBy", "updatedAt", date, "deletedAt", "approvedBy", "customerId", "jobId", "multipleModes", "originalReceiptRef", "outstandingBalance", "receiptNumber", "refundReason", type) FROM stdin;
\.


--
-- Data for Name: PriceMaster; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."PriceMaster" (id, "itemType", code, name, price, "franchiseId", status) FROM stdin;
\.


--
-- Data for Name: PurchaseOrder; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."PurchaseOrder" (id, "orderNumber", "vendorId", "vendorName", stage, items, "totalAmount", "paidAmount", "invoiceNumber", "receivedAt", "paidAt", notes, "createdBy", "createdAt", "updatedAt", "isDeleted", "deletedAt", cess, cgst, "hsnSac", igst, "invoiceDate", "itcClaimed", "itcEligible", "placeOfSupply", sgst, "supplyType", "taxableValue", "vendorGstin", "vendorState") FROM stdin;
\.


--
-- Data for Name: PurchaseOrderLine; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."PurchaseOrderLine" (id, "purchaseOrderId", description, sku, "hsnSac", quantity, "unitPrice", "taxableAmount", "gstRate", cgst, sgst, igst, cess, "lineTotal", "itcEligible") FROM stdin;
\.


--
-- Data for Name: QCChecklistTemplate; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."QCChecklistTemplate" (id, category, label, "order", "isDefault", "franchiseId", "isDeleted", "createdAt") FROM stdin;
cmsen5tcx0008xwvpqvj6j0g3	Exterior	Paint Finish Verified	1	t	\N	f	2026-08-04 12:35:44.481
cmsen5tcx0009xwvp3myn0sje	Exterior	Wax / Coating Completed	2	t	\N	f	2026-08-04 12:35:44.481
cmsen5tcx000axwvp7qcb1noi	Exterior	Water Spots Removed	3	t	\N	f	2026-08-04 12:35:44.481
cmsen5tcx000bxwvpn2za7wy3	Exterior	Tyres Cleaned	4	t	\N	f	2026-08-04 12:35:44.481
cmsen5tcx000cxwvpu0bnemcq	Exterior	Glass Cleaned	5	t	\N	f	2026-08-04 12:35:44.481
cmsen5tcx000dxwvpez3ewjqy	Interior	Dashboard Cleaned	1	t	\N	f	2026-08-04 12:35:44.481
cmsen5tcx000exwvpdxq2w4t4	Interior	Seats Cleaned	2	t	\N	f	2026-08-04 12:35:44.481
cmsen5tcx000fxwvpcu0mglef	Interior	Floor Mats Cleaned	3	t	\N	f	2026-08-04 12:35:44.481
cmsen5tcx000gxwvpkc65szch	Interior	Vacuum Completed	4	t	\N	f	2026-08-04 12:35:44.481
cmsen5tcx000hxwvp5vgpdu2a	Interior	Interior Odour Checked	5	t	\N	f	2026-08-04 12:35:44.481
cmsen5tcx000ixwvpn6x45mp4	Accessories	Accessories Returned	1	t	\N	f	2026-08-04 12:35:44.481
cmsen5tcx000jxwvp73jchpm1	Accessories	Spare Wheel Available	2	t	\N	f	2026-08-04 12:35:44.481
cmsen5tcx000kxwvp5jfzpm5t	Accessories	Toolkit Available	3	t	\N	f	2026-08-04 12:35:44.481
cmsen5tcx000lxwvpcjc8ij7e	Accessories	Documents Available	4	t	\N	f	2026-08-04 12:35:44.481
cmsen5tcx000mxwvpn64xcp4y	Final Inspection	Vehicle Cleanliness	1	t	\N	f	2026-08-04 12:35:44.481
cmsen5tcx000nxwvp3zvqid7f	Final Inspection	Customer Requested Services Completed	2	t	\N	f	2026-08-04 12:35:44.481
cmsen5tcx000oxwvptlt47vmr	Final Inspection	No New Damage	3	t	\N	f	2026-08-04 12:35:44.481
cmsen5tcx000pxwvptrmfxgfm	Final Inspection	Vehicle Ready for Delivery	4	t	\N	f	2026-08-04 12:35:44.481
\.


--
-- Data for Name: QCInspection; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."QCInspection" (id, "jobId", "attemptNumber", "inspectorId", "inspectorName", "scheduledAt", priority, "assignRemarks", checklist, result, reason, remarks, "reworkRequired", "decidedAt", "franchiseId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: ReceiptSequence; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."ReceiptSequence" (prefix, counter) FROM stdin;
\.


--
-- Data for Name: Referral; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."Referral" (id, "referringCustomerId", "referringCustomer", "referredLeadId", "referredCustomerId", "referredName", "referredPhone", "referralDate", status, "rewardPointsApplied", "franchiseId", "isDeleted", "deletedAt", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: RolePermission; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."RolePermission" (role, permissions, actions) FROM stdin;
SUPER_ADMIN	{dashboard,franchise,employees,customers,leads,appointments,carin,jobs,workshop,qc,billing,payments,inventory,reports,settings,roles}	{}
HQ_OPERATIONS	{dashboard,franchise,employees,customers,leads,appointments,carin,jobs,workshop,inventory,reports}	{}
HQ_INVENTORY	{dashboard,franchise,inventory,reports,requests}	{}
HQ_ACCOUNTS	{dashboard,franchise,customers,billing,payments,reports}	{}
FRANCHISE_ADMIN	{dashboard,employees,customers,leads,appointments,carin,jobs,workshop,qc,billing,payments,inventory,reports,settings}	{}
RECEPTION_EXECUTIVE	{dashboard,customers,leads,appointments,carin,jobs}	{}
SERVICE_ADVISOR	{dashboard,customers,leads,appointments,carin,jobs,workshop,inventory,reports}	{}
TECHNICIAN	{dashboard,jobs,workshop,inventory,reports}	{}
QUALITY_INSPECTOR	{dashboard,customers,jobs,qc}	{}
BILLING_EXECUTIVE	{dashboard,jobs,billing,payments,reports}	{}
\.


--
-- Data for Name: Service; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."Service" (id, name, category, price, duration, warranty, "desc", "isDeleted", "deletedAt", code, gst, "minPrice", status, "hsnSac", "taxApplicable") FROM stdin;
\.


--
-- Data for Name: ServiceMaster; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."ServiceMaster" (id, code, name, category, "standardPrice", "estimatedTime", warranty, status, "allowPriceEdit") FROM stdin;
\.


--
-- Data for Name: ServiceReminder; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."ServiceReminder" (id, "customerId", "vehicleNo", "reminderType", "scheduledDate", status, notes, "isDeleted", "deletedAt", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Session; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."Session" (id, "employeeId", jti, "issuedAt", "expiresAt", "revokedAt", "revokedReason", "ipAddress", device) FROM stdin;
cmu0ugwhc00034svpz7y1w3pt	HQ-001	bdaf8bef-3c2f-4f2d-8b46-25274865da14	2026-09-14 06:10:57.264	2026-09-15 06:10:57.243	\N	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36
cmu0uhkqb00054svps8ylqh0h	HQ-001	9c206094-291b-44d8-b930-8577b04cc934	2026-09-14 06:11:28.691	2026-09-15 06:11:28.691	\N	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36
\.


--
-- Data for Name: Setting; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."Setting" (id, "companyName", address, phone, email, gstin, "gstPct", currency, agents, categories, "securityGuards", "isDeleted", "deletedAt", "branchAddress", city, "companyLogo", country, "leadSources", "leadStatuses", "lostReasons", "loyaltyProgram", "notificationTemplates", "numberingSeries", "panNumber", "pinCode", "referralProgram", "registeredAddress", state, website, "workingHours") FROM stdin;
default	ERP Shifterz	123 Main St	1234567890	contact@shifterz.com		18	INR	{}	{}	{}	f	\N	\N	\N	\N	\N	{Website,Walk-In,"Phone Call",WhatsApp,"Google Business Profile",Facebook,Instagram,Justdial,Referral,"Existing Customer",Corporate,"Exhibition / Event","Manual Entry",Other}	{New,Assigned,Contacted,"Follow-up Required","Quotation Sent",Negotiation,Converted,Lost,Closed}	{Price,"Competitor Chosen","No Response",Postponed,"Budget Constraints","Duplicate Enquiry",Other}	{}	{}	{}	\N	\N	{}	\N	\N	\N	{}
\.


--
-- Data for Name: TaxMaster; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."TaxMaster" (id, name, percentage, "franchiseId", status, "effectiveFrom", "effectiveTo") FROM stdin;
\.


--
-- Data for Name: UserPermission; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."UserPermission" (id, "employeeId", modules, "createdAt", "updatedAt", actions, "actionsOverride") FROM stdin;
\.


--
-- Data for Name: Vendor; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."Vendor" (id, code, name, "gstNumber", contact, phone, email, address, status, "isDeleted", "deletedAt", "createdAt", state) FROM stdin;
\.


--
-- Data for Name: Warranty; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."Warranty" (id, "customerId", "vehicleNo", "jobId", "invoiceId", "itemName", "durationDays", "startDate", "expiryDate", status, notes, "isDeleted", "deletedAt", "createdAt", "updatedAt", claims, "warrantyNo") FROM stdin;
\.


--
-- Data for Name: WorkNote; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."WorkNote" (id, "jobId", note, "createdById", "createdBy", "franchiseId", "createdAt") FROM stdin;
\.


--
-- Data for Name: WorkflowStage; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public."WorkflowStage" (id, name, "order", "isDefault", "franchiseId", "isDeleted", "createdAt") FROM stdin;
cmsen5tcm0000xwvp8zann0kq	Assigned	1	t	\N	f	2026-08-04 12:35:44.47
cmsen5tcn0001xwvpxc7ow5q8	Work Started	2	t	\N	f	2026-08-04 12:35:44.47
cmsen5tcn0002xwvpaaptthrd	Surface Preparation	3	t	\N	f	2026-08-04 12:35:44.47
cmsen5tcn0003xwvp3462gqwq	Service In Progress	4	t	\N	f	2026-08-04 12:35:44.47
cmsen5tcn0004xwvp17v41gu0	Waiting for Customer Approval	5	t	\N	f	2026-08-04 12:35:44.47
cmsen5tcn0005xwvp20hqbu1o	Waiting for Material	6	t	\N	f	2026-08-04 12:35:44.47
cmsen5tcn0006xwvprq3vmbrr	Work Completed	7	t	\N	f	2026-08-04 12:35:44.47
cmsen5tcn0007xwvpfnaujpf5	Sent for Quality Check	8	t	\N	f	2026-08-04 12:35:44.47
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: shifterz
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
2e388b53-55e4-4a97-b94c-416ebd758dbd	6af4a32b2f83a9cd8ada1c1c1c3773f159aeecd8162275576db824e1f43ed970	2026-08-04 12:34:41.760564+00	20260711100608	\N	\N	2026-08-04 12:34:41.356845+00	1
0e3c0187-3d85-423e-8292-cbcef38ff505	c2bd5fc7f001e5e5803bc7d289d026734b01cbad6be653ad3449bcca3b2f5c0d	2026-08-04 12:34:41.827835+00	20260723055649	\N	\N	2026-08-04 12:34:41.762937+00	1
dc32804f-1338-451f-9216-597adc20fc35	b1f5db418950b950f08a616ab5ba597d6d0c960794649fe04d70fd6fa1287b8e	2026-08-04 12:34:41.838551+00	20260728052021	\N	\N	2026-08-04 12:34:41.830163+00	1
c4b5d0e5-cd77-4757-abed-6b7d482fa27f	4c0ae12555244d1bfa4e8b3c28d4e8ee6a3973f904f649983f9887f36e221085	\N	20260804043202_sync_schema	A migration failed to apply. New migrations cannot be applied before the error is recovered from. Read more about how to resolve migration issues in a production database: https://pris.ly/d/migrate-resolve\n\nMigration name: 20260804043202_sync_schema\n\nDatabase error code: 42701\n\nDatabase error:\nERROR: column "actualCompletion" of relation "Job" already exists\n\nDbError { severity: "ERROR", parsed_severity: Some(Error), code: SqlState(E42701), message: "column \\"actualCompletion\\" of relation \\"Job\\" already exists", detail: None, hint: None, position: None, where_: None, schema: None, table: None, column: None, datatype: None, constraint: None, file: Some("tablecmds.c"), line: Some(7279), routine: Some("check_for_column_name_collision") }\n\n   0: sql_schema_connector::apply_migration::apply_script\n           with migration_name="20260804043202_sync_schema"\n             at schema-engine\\connectors\\sql-schema-connector\\src\\apply_migration.rs:113\n   1: schema_commands::commands::apply_migrations::Applying migration\n           with migration_name="20260804043202_sync_schema"\n             at schema-engine\\commands\\src\\commands\\apply_migrations.rs:95\n   2: schema_core::state::ApplyMigrations\n             at schema-engine\\core\\src\\state.rs:255	\N	2026-09-14 05:59:13.043279+00	0
\.


--
-- Name: AdditionalWork AdditionalWork_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."AdditionalWork"
    ADD CONSTRAINT "AdditionalWork_pkey" PRIMARY KEY (id);


--
-- Name: Appointment Appointment_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Appointment"
    ADD CONSTRAINT "Appointment_pkey" PRIMARY KEY (id);


--
-- Name: Approval Approval_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Approval"
    ADD CONSTRAINT "Approval_pkey" PRIMARY KEY (id);


--
-- Name: Attendance Attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Attendance"
    ADD CONSTRAINT "Attendance_pkey" PRIMARY KEY (id);


--
-- Name: AuditLog AuditLog_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY (id);


--
-- Name: CalendarEvent CalendarEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."CalendarEvent"
    ADD CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY (id);


--
-- Name: Callback Callback_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Callback"
    ADD CONSTRAINT "Callback_pkey" PRIMARY KEY (id);


--
-- Name: CarIn CarIn_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."CarIn"
    ADD CONSTRAINT "CarIn_pkey" PRIMARY KEY (id);


--
-- Name: CreditNoteLine CreditNoteLine_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."CreditNoteLine"
    ADD CONSTRAINT "CreditNoteLine_pkey" PRIMARY KEY (id);


--
-- Name: CreditNote CreditNote_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."CreditNote"
    ADD CONSTRAINT "CreditNote_pkey" PRIMARY KEY (id);


--
-- Name: CustomerComplaint CustomerComplaint_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."CustomerComplaint"
    ADD CONSTRAINT "CustomerComplaint_pkey" PRIMARY KEY (id);


--
-- Name: CustomerVehicle CustomerVehicle_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."CustomerVehicle"
    ADD CONSTRAINT "CustomerVehicle_pkey" PRIMARY KEY (id);


--
-- Name: Customer Customer_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Customer"
    ADD CONSTRAINT "Customer_pkey" PRIMARY KEY (id);


--
-- Name: DashboardWidgetConfig DashboardWidgetConfig_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."DashboardWidgetConfig"
    ADD CONSTRAINT "DashboardWidgetConfig_pkey" PRIMARY KEY (id);


--
-- Name: DebitNoteLine DebitNoteLine_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."DebitNoteLine"
    ADD CONSTRAINT "DebitNoteLine_pkey" PRIMARY KEY (id);


--
-- Name: DebitNote DebitNote_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."DebitNote"
    ADD CONSTRAINT "DebitNote_pkey" PRIMARY KEY (id);


--
-- Name: DiscountMaster DiscountMaster_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."DiscountMaster"
    ADD CONSTRAINT "DiscountMaster_pkey" PRIMARY KEY (id);


--
-- Name: Employee Employee_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Employee"
    ADD CONSTRAINT "Employee_pkey" PRIMARY KEY (id);


--
-- Name: Estimate Estimate_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Estimate"
    ADD CONSTRAINT "Estimate_pkey" PRIMARY KEY (id);


--
-- Name: Franchise Franchise_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Franchise"
    ADD CONSTRAINT "Franchise_pkey" PRIMARY KEY (id);


--
-- Name: GstTransaction GstTransaction_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."GstTransaction"
    ADD CONSTRAINT "GstTransaction_pkey" PRIMARY KEY (id);


--
-- Name: HsnSacMaster HsnSacMaster_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."HsnSacMaster"
    ADD CONSTRAINT "HsnSacMaster_pkey" PRIMARY KEY (id);


--
-- Name: InventoryAdjustmentRequest InventoryAdjustmentRequest_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."InventoryAdjustmentRequest"
    ADD CONSTRAINT "InventoryAdjustmentRequest_pkey" PRIMARY KEY (id);


--
-- Name: InventoryMovement InventoryMovement_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."InventoryMovement"
    ADD CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY (id);


--
-- Name: InventoryRequest InventoryRequest_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."InventoryRequest"
    ADD CONSTRAINT "InventoryRequest_pkey" PRIMARY KEY (id);


--
-- Name: Inventory Inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Inventory"
    ADD CONSTRAINT "Inventory_pkey" PRIMARY KEY (id);


--
-- Name: InvoiceLine InvoiceLine_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."InvoiceLine"
    ADD CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY (id);


--
-- Name: InvoiceSequence InvoiceSequence_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."InvoiceSequence"
    ADD CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY (prefix);


--
-- Name: Invoice Invoice_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Invoice"
    ADD CONSTRAINT "Invoice_pkey" PRIMARY KEY (id);


--
-- Name: JobHistory JobHistory_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."JobHistory"
    ADD CONSTRAINT "JobHistory_pkey" PRIMARY KEY (id);


--
-- Name: JobPhoto JobPhoto_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."JobPhoto"
    ADD CONSTRAINT "JobPhoto_pkey" PRIMARY KEY (id);


--
-- Name: Job Job_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Job"
    ADD CONSTRAINT "Job_pkey" PRIMARY KEY (id);


--
-- Name: LeadAssignmentHistory LeadAssignmentHistory_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."LeadAssignmentHistory"
    ADD CONSTRAINT "LeadAssignmentHistory_pkey" PRIMARY KEY (id);


--
-- Name: LeadFollowUp LeadFollowUp_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."LeadFollowUp"
    ADD CONSTRAINT "LeadFollowUp_pkey" PRIMARY KEY (id);


--
-- Name: LeadTransferHistory LeadTransferHistory_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."LeadTransferHistory"
    ADD CONSTRAINT "LeadTransferHistory_pkey" PRIMARY KEY (id);


--
-- Name: Lead Lead_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Lead"
    ADD CONSTRAINT "Lead_pkey" PRIMARY KEY (id);


--
-- Name: LeaveRequest LeaveRequest_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."LeaveRequest"
    ADD CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY (id);


--
-- Name: License License_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."License"
    ADD CONSTRAINT "License_pkey" PRIMARY KEY (id);


--
-- Name: MasterData MasterData_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."MasterData"
    ADD CONSTRAINT "MasterData_pkey" PRIMARY KEY (id);


--
-- Name: MaterialConsumption MaterialConsumption_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."MaterialConsumption"
    ADD CONSTRAINT "MaterialConsumption_pkey" PRIMARY KEY (id);


--
-- Name: MemberTransferRequest MemberTransferRequest_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."MemberTransferRequest"
    ADD CONSTRAINT "MemberTransferRequest_pkey" PRIMARY KEY (id);


--
-- Name: Notification Notification_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Notification"
    ADD CONSTRAINT "Notification_pkey" PRIMARY KEY (id);


--
-- Name: OutPass OutPass_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."OutPass"
    ADD CONSTRAINT "OutPass_pkey" PRIMARY KEY (id);


--
-- Name: Payment Payment_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_pkey" PRIMARY KEY (id);


--
-- Name: PriceMaster PriceMaster_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."PriceMaster"
    ADD CONSTRAINT "PriceMaster_pkey" PRIMARY KEY (id);


--
-- Name: PurchaseOrderLine PurchaseOrderLine_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."PurchaseOrderLine"
    ADD CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY (id);


--
-- Name: PurchaseOrder PurchaseOrder_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."PurchaseOrder"
    ADD CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY (id);


--
-- Name: QCChecklistTemplate QCChecklistTemplate_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."QCChecklistTemplate"
    ADD CONSTRAINT "QCChecklistTemplate_pkey" PRIMARY KEY (id);


--
-- Name: QCInspection QCInspection_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."QCInspection"
    ADD CONSTRAINT "QCInspection_pkey" PRIMARY KEY (id);


--
-- Name: ReceiptSequence ReceiptSequence_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."ReceiptSequence"
    ADD CONSTRAINT "ReceiptSequence_pkey" PRIMARY KEY (prefix);


--
-- Name: Referral Referral_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Referral"
    ADD CONSTRAINT "Referral_pkey" PRIMARY KEY (id);


--
-- Name: RolePermission RolePermission_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."RolePermission"
    ADD CONSTRAINT "RolePermission_pkey" PRIMARY KEY (role);


--
-- Name: ServiceMaster ServiceMaster_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."ServiceMaster"
    ADD CONSTRAINT "ServiceMaster_pkey" PRIMARY KEY (id);


--
-- Name: ServiceReminder ServiceReminder_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."ServiceReminder"
    ADD CONSTRAINT "ServiceReminder_pkey" PRIMARY KEY (id);


--
-- Name: Service Service_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Service"
    ADD CONSTRAINT "Service_pkey" PRIMARY KEY (id);


--
-- Name: Session Session_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Session"
    ADD CONSTRAINT "Session_pkey" PRIMARY KEY (id);


--
-- Name: Setting Setting_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Setting"
    ADD CONSTRAINT "Setting_pkey" PRIMARY KEY (id);


--
-- Name: TaxMaster TaxMaster_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."TaxMaster"
    ADD CONSTRAINT "TaxMaster_pkey" PRIMARY KEY (id);


--
-- Name: UserPermission UserPermission_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."UserPermission"
    ADD CONSTRAINT "UserPermission_pkey" PRIMARY KEY (id);


--
-- Name: Vendor Vendor_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Vendor"
    ADD CONSTRAINT "Vendor_pkey" PRIMARY KEY (id);


--
-- Name: Warranty Warranty_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Warranty"
    ADD CONSTRAINT "Warranty_pkey" PRIMARY KEY (id);


--
-- Name: WorkNote WorkNote_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."WorkNote"
    ADD CONSTRAINT "WorkNote_pkey" PRIMARY KEY (id);


--
-- Name: WorkflowStage WorkflowStage_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."WorkflowStage"
    ADD CONSTRAINT "WorkflowStage_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: CreditNote_number_key; Type: INDEX; Schema: public; Owner: shifterz
--

CREATE UNIQUE INDEX "CreditNote_number_key" ON public."CreditNote" USING btree (number);


--
-- Name: CustomerVehicle_vehicleNo_key; Type: INDEX; Schema: public; Owner: shifterz
--

CREATE UNIQUE INDEX "CustomerVehicle_vehicleNo_key" ON public."CustomerVehicle" USING btree ("vehicleNo");


--
-- Name: Customer_convertedLeadId_key; Type: INDEX; Schema: public; Owner: shifterz
--

CREATE UNIQUE INDEX "Customer_convertedLeadId_key" ON public."Customer" USING btree ("convertedLeadId");


--
-- Name: DashboardWidgetConfig_dashboardType_widgetKey_key; Type: INDEX; Schema: public; Owner: shifterz
--

CREATE UNIQUE INDEX "DashboardWidgetConfig_dashboardType_widgetKey_key" ON public."DashboardWidgetConfig" USING btree ("dashboardType", "widgetKey");


--
-- Name: DebitNote_number_key; Type: INDEX; Schema: public; Owner: shifterz
--

CREATE UNIQUE INDEX "DebitNote_number_key" ON public."DebitNote" USING btree (number);


--
-- Name: Employee_username_key; Type: INDEX; Schema: public; Owner: shifterz
--

CREATE UNIQUE INDEX "Employee_username_key" ON public."Employee" USING btree (username);


--
-- Name: GstTransaction_documentType_documentId_idx; Type: INDEX; Schema: public; Owner: shifterz
--

CREATE INDEX "GstTransaction_documentType_documentId_idx" ON public."GstTransaction" USING btree ("documentType", "documentId");


--
-- Name: GstTransaction_franchiseId_idx; Type: INDEX; Schema: public; Owner: shifterz
--

CREATE INDEX "GstTransaction_franchiseId_idx" ON public."GstTransaction" USING btree ("franchiseId");


--
-- Name: GstTransaction_returnPeriod_idx; Type: INDEX; Schema: public; Owner: shifterz
--

CREATE INDEX "GstTransaction_returnPeriod_idx" ON public."GstTransaction" USING btree ("returnPeriod");


--
-- Name: HsnSacMaster_code_key; Type: INDEX; Schema: public; Owner: shifterz
--

CREATE UNIQUE INDEX "HsnSacMaster_code_key" ON public."HsnSacMaster" USING btree (code);


--
-- Name: License_licenseKey_key; Type: INDEX; Schema: public; Owner: shifterz
--

CREATE UNIQUE INDEX "License_licenseKey_key" ON public."License" USING btree ("licenseKey");


--
-- Name: MasterData_category_idx; Type: INDEX; Schema: public; Owner: shifterz
--

CREATE INDEX "MasterData_category_idx" ON public."MasterData" USING btree (category);


--
-- Name: MasterData_parentId_idx; Type: INDEX; Schema: public; Owner: shifterz
--

CREATE INDEX "MasterData_parentId_idx" ON public."MasterData" USING btree ("parentId");


--
-- Name: Payment_receiptNumber_key; Type: INDEX; Schema: public; Owner: shifterz
--

CREATE UNIQUE INDEX "Payment_receiptNumber_key" ON public."Payment" USING btree ("receiptNumber");


--
-- Name: PriceMaster_code_key; Type: INDEX; Schema: public; Owner: shifterz
--

CREATE UNIQUE INDEX "PriceMaster_code_key" ON public."PriceMaster" USING btree (code);


--
-- Name: PurchaseOrder_orderNumber_key; Type: INDEX; Schema: public; Owner: shifterz
--

CREATE UNIQUE INDEX "PurchaseOrder_orderNumber_key" ON public."PurchaseOrder" USING btree ("orderNumber");


--
-- Name: Referral_referredCustomerId_key; Type: INDEX; Schema: public; Owner: shifterz
--

CREATE UNIQUE INDEX "Referral_referredCustomerId_key" ON public."Referral" USING btree ("referredCustomerId");


--
-- Name: Referral_referredLeadId_key; Type: INDEX; Schema: public; Owner: shifterz
--

CREATE UNIQUE INDEX "Referral_referredLeadId_key" ON public."Referral" USING btree ("referredLeadId");


--
-- Name: ServiceMaster_code_key; Type: INDEX; Schema: public; Owner: shifterz
--

CREATE UNIQUE INDEX "ServiceMaster_code_key" ON public."ServiceMaster" USING btree (code);


--
-- Name: Service_code_key; Type: INDEX; Schema: public; Owner: shifterz
--

CREATE UNIQUE INDEX "Service_code_key" ON public."Service" USING btree (code);


--
-- Name: Session_employeeId_idx; Type: INDEX; Schema: public; Owner: shifterz
--

CREATE INDEX "Session_employeeId_idx" ON public."Session" USING btree ("employeeId");


--
-- Name: Session_jti_key; Type: INDEX; Schema: public; Owner: shifterz
--

CREATE UNIQUE INDEX "Session_jti_key" ON public."Session" USING btree (jti);


--
-- Name: UserPermission_employeeId_key; Type: INDEX; Schema: public; Owner: shifterz
--

CREATE UNIQUE INDEX "UserPermission_employeeId_key" ON public."UserPermission" USING btree ("employeeId");


--
-- Name: Vendor_code_key; Type: INDEX; Schema: public; Owner: shifterz
--

CREATE UNIQUE INDEX "Vendor_code_key" ON public."Vendor" USING btree (code);


--
-- Name: Warranty_warrantyNo_key; Type: INDEX; Schema: public; Owner: shifterz
--

CREATE UNIQUE INDEX "Warranty_warrantyNo_key" ON public."Warranty" USING btree ("warrantyNo");


--
-- Name: AdditionalWork AdditionalWork_jobId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."AdditionalWork"
    ADD CONSTRAINT "AdditionalWork_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES public."Job"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Appointment Appointment_franchiseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Appointment"
    ADD CONSTRAINT "Appointment_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES public."Franchise"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Attendance Attendance_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Attendance"
    ADD CONSTRAINT "Attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public."Employee"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Attendance Attendance_franchiseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Attendance"
    ADD CONSTRAINT "Attendance_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES public."Franchise"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: CarIn CarIn_franchiseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."CarIn"
    ADD CONSTRAINT "CarIn_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES public."Franchise"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: CreditNoteLine CreditNoteLine_creditNoteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."CreditNoteLine"
    ADD CONSTRAINT "CreditNoteLine_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES public."CreditNote"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CreditNote CreditNote_originalInvoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."CreditNote"
    ADD CONSTRAINT "CreditNote_originalInvoiceId_fkey" FOREIGN KEY ("originalInvoiceId") REFERENCES public."Invoice"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CustomerComplaint CustomerComplaint_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."CustomerComplaint"
    ADD CONSTRAINT "CustomerComplaint_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public."Customer"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CustomerComplaint CustomerComplaint_jobId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."CustomerComplaint"
    ADD CONSTRAINT "CustomerComplaint_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES public."Job"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: CustomerVehicle CustomerVehicle_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."CustomerVehicle"
    ADD CONSTRAINT "CustomerVehicle_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public."Customer"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Customer Customer_franchiseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Customer"
    ADD CONSTRAINT "Customer_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES public."Franchise"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: DebitNoteLine DebitNoteLine_debitNoteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."DebitNoteLine"
    ADD CONSTRAINT "DebitNoteLine_debitNoteId_fkey" FOREIGN KEY ("debitNoteId") REFERENCES public."DebitNote"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: DebitNote DebitNote_originalInvoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."DebitNote"
    ADD CONSTRAINT "DebitNote_originalInvoiceId_fkey" FOREIGN KEY ("originalInvoiceId") REFERENCES public."Invoice"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Employee Employee_franchiseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Employee"
    ADD CONSTRAINT "Employee_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES public."Franchise"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Estimate Estimate_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Estimate"
    ADD CONSTRAINT "Estimate_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public."Customer"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Estimate Estimate_franchiseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Estimate"
    ADD CONSTRAINT "Estimate_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES public."Franchise"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: InventoryAdjustmentRequest InventoryAdjustmentRequest_franchiseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."InventoryAdjustmentRequest"
    ADD CONSTRAINT "InventoryAdjustmentRequest_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES public."Franchise"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: InventoryRequest InventoryRequest_franchiseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."InventoryRequest"
    ADD CONSTRAINT "InventoryRequest_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES public."Franchise"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Inventory Inventory_franchiseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Inventory"
    ADD CONSTRAINT "Inventory_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES public."Franchise"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: InvoiceLine InvoiceLine_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."InvoiceLine"
    ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES public."Invoice"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Invoice Invoice_franchiseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Invoice"
    ADD CONSTRAINT "Invoice_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES public."Franchise"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Invoice Invoice_jobId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Invoice"
    ADD CONSTRAINT "Invoice_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES public."Job"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: JobHistory JobHistory_jobId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."JobHistory"
    ADD CONSTRAINT "JobHistory_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES public."Job"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: JobPhoto JobPhoto_jobId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."JobPhoto"
    ADD CONSTRAINT "JobPhoto_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES public."Job"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: JobPhoto JobPhoto_qcInspectionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."JobPhoto"
    ADD CONSTRAINT "JobPhoto_qcInspectionId_fkey" FOREIGN KEY ("qcInspectionId") REFERENCES public."QCInspection"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Job Job_franchiseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Job"
    ADD CONSTRAINT "Job_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES public."Franchise"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: LeadAssignmentHistory LeadAssignmentHistory_leadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."LeadAssignmentHistory"
    ADD CONSTRAINT "LeadAssignmentHistory_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES public."Lead"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: LeadFollowUp LeadFollowUp_leadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."LeadFollowUp"
    ADD CONSTRAINT "LeadFollowUp_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES public."Lead"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: LeadTransferHistory LeadTransferHistory_leadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."LeadTransferHistory"
    ADD CONSTRAINT "LeadTransferHistory_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES public."Lead"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Lead Lead_franchiseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Lead"
    ADD CONSTRAINT "Lead_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES public."Franchise"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: LeaveRequest LeaveRequest_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."LeaveRequest"
    ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public."Employee"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: LeaveRequest LeaveRequest_franchiseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."LeaveRequest"
    ADD CONSTRAINT "LeaveRequest_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES public."Franchise"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: MaterialConsumption MaterialConsumption_jobId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."MaterialConsumption"
    ADD CONSTRAINT "MaterialConsumption_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES public."Job"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: OutPass OutPass_franchiseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."OutPass"
    ADD CONSTRAINT "OutPass_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES public."Franchise"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Payment Payment_franchiseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES public."Franchise"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PurchaseOrderLine PurchaseOrderLine_purchaseOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."PurchaseOrderLine"
    ADD CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES public."PurchaseOrder"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: PurchaseOrder PurchaseOrder_vendorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."PurchaseOrder"
    ADD CONSTRAINT "PurchaseOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES public."Vendor"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: QCChecklistTemplate QCChecklistTemplate_franchiseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."QCChecklistTemplate"
    ADD CONSTRAINT "QCChecklistTemplate_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES public."Franchise"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: QCInspection QCInspection_jobId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."QCInspection"
    ADD CONSTRAINT "QCInspection_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES public."Job"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ServiceReminder ServiceReminder_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."ServiceReminder"
    ADD CONSTRAINT "ServiceReminder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public."Customer"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Session Session_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Session"
    ADD CONSTRAINT "Session_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public."Employee"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UserPermission UserPermission_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."UserPermission"
    ADD CONSTRAINT "UserPermission_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public."Employee"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Warranty Warranty_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."Warranty"
    ADD CONSTRAINT "Warranty_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public."Customer"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: WorkNote WorkNote_jobId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."WorkNote"
    ADD CONSTRAINT "WorkNote_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES public."Job"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: WorkflowStage WorkflowStage_franchiseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shifterz
--

ALTER TABLE ONLY public."WorkflowStage"
    ADD CONSTRAINT "WorkflowStage_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES public."Franchise"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: shifterz
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;


--
-- PostgreSQL database dump complete
--

\unrestrict Nf4RnyD6weZXudTQVGUyXULrq1cgH0uLIstTD0wUWLWvNGsgpZbelUWzifZY68Q

