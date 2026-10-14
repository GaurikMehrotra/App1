export interface AIStudyProvider {
    summarize(noteId: string): Promise<{
        text: string;
        label: 'AI-generated, may be wrong';
    }>;
    ask(noteId: string, question: string): Promise<{
        text: string;
        label: 'AI-generated, may be wrong';
    }>;
}
export interface PaymentProvider {
    createOrder(eventId: string): Promise<{
        orderId: string;
        amount: number;
        currency: 'INR';
        testMode: true;
    }>;
    verify(paymentId: string, signature: string): Promise<boolean>;
}
export interface NewsProvider {
    fetch(feedUrl: string): Promise<{
        title: string;
        url: string;
        source: string;
        publishedAt: string;
    }[]>;
}
export const aiLabel = 'AI-generated, may be wrong' as const;
export interface DigestEmailProvider {
    send(input: {
        to: string;
        subject: string;
        text: string;
        idempotencyKey: string;
    }): Promise<void>;
}
