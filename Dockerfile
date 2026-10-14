FROM golang:1.26-alpine AS builder

WORKDIR /app

COPY go.mod ./
RUN go mod download

COPY *.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -o server .

FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /app

COPY --from=builder /app/server .

EXPOSE 3000

CMD ["./server"]
