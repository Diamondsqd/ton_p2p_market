import "@stdlib/deploy";

contract TaskEscrow with Deployable {
    customer: Address;
    admin: Address;
    deadline: Int as uint32;
    amount: Int as coins; 
    freelancer: Address? = null;
    is_completed: Bool = false;
    is_disputed: Bool = false;

    init(customer: Address, admin: Address, deadline: Int, amount: Int) {
        self.customer = customer;
        self.admin = admin;
        self.deadline = deadline;
        self.amount = amount;
    }

    receive("Deploy") {}

    receive("Take") {
        require(self.freelancer == null, "Already taken");
        require(sender() != self.customer, "Customer cannot be freelancer");
        self.freelancer = sender();
        self.reply("Accepted".asComment());
    }

    receive("Complete") {
        require(sender() == self.freelancer, "Only freelancer");
        self.is_completed = true;
        self.reply("Submitted".asComment());
    }

    receive("Release") {
        require(sender() == self.customer, "Only customer");
        require(self.is_completed, "Work not submitted");
        require(self.freelancer != null, "No freelancer");

        send(SendParameters{
            to: self.freelancer!!,
            value: self.amount, 
            mode: SendPayGasSeparately, 
            body: "Payment".asComment()
        });
        
        send(SendParameters{
            to: sender(), // Заказчик забирает свою сдачу
            value: 0,
            mode: SendRemainingBalance + SendDestroyIfZero,
            body: "Contract Closed".asComment()
        });
    }

    // --- АРБИТРАЖ: ВЫПЛАТА ИСПОЛНИТЕЛЮ ---
    receive("AdminRelease") {
        require(sender() == self.admin, "Only admin");
        require(self.is_disputed, "No dispute");
        
        send(SendParameters{
            to: sender(),
            value: 0,
            mode: SendRemainingValue,
            body: "Admin gas return".asComment()
        });

        send(SendParameters{
            to: self.freelancer!!,
            value: self.amount,
            mode: SendPayGasSeparately,
            body: "Admin Release".asComment()
        });
        
        send(SendParameters{
            to: self.customer,
            value: 0,
            mode: SendRemainingBalance + SendDestroyIfZero,
            body: "Customer left-overs".asComment()
        });
    }

    // --- АРБИТРАЖ: ВОЗВРАТ ЗАКАЗЧИКУ ---
    receive("AdminRefund") {
        require(sender() == self.admin, "Only admin");
        require(self.is_disputed, "No dispute");


        send(SendParameters{
            to: sender(),
            value: 0,
            mode: SendRemainingValue,
            body: "Admin gas return".asComment()
        });


        send(SendParameters{
            to: self.customer,
            value: 0,
            mode: SendRemainingBalance + SendDestroyIfZero,
            body: "Admin Refunded".asComment()
        });
    }

    receive("Refund") {
        require(sender() == self.customer, "Only customer");
        require(now() > self.deadline || self.is_disputed, "Not possible");

        send(SendParameters{
            to: sender(),
            value: 0,
            mode: SendRemainingBalance + SendDestroyIfZero,
            body: "Refunded".asComment()
        });
    }

    receive("Dispute") {
        require(sender() == self.customer || sender() == self.freelancer, "Access denied!");
        self.is_disputed = true;
        self.reply("Disputed".asComment());
    }
}