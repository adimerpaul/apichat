import 'package:flutter/material.dart';

import '../models/chat_message.dart';
import '../viewmodels/chat_view_model.dart';
import '../widgets/error_text.dart';
import '../widgets/message_bubble.dart';

class ChatPage extends StatefulWidget {
  const ChatPage({super.key});

  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> {
  late final ChatViewModel _viewModel;
  final _nameController = TextEditingController();
  final _messageController = TextEditingController();
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _viewModel = ChatViewModel();
    _viewModel.addListener(_scrollWhenMessagesChange);
  }

  void _scrollWhenMessagesChange() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) {
        return;
      }

      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
      );
    });
  }

  Future<void> _sendMessage() async {
    final sent = await _viewModel.sendMessage(_messageController.text);
    if (sent) {
      _messageController.clear();
    }
  }

  Future<void> _editMessage(ChatMessage message) async {
    final nextText = await showDialog<String>(
      context: context,
      builder: (context) {
        final controller = TextEditingController(text: message.message);
        return AlertDialog(
          title: const Text('Editar mensaje'),
          content: TextField(
            controller: controller,
            autofocus: true,
            maxLines: 4,
            minLines: 1,
            decoration: const InputDecoration(border: OutlineInputBorder()),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, controller.text),
              child: const Text('Guardar'),
            ),
          ],
        );
      },
    );

    if (nextText != null) {
      await _viewModel.editMessage(message, nextText);
    }
  }

  Future<void> _deleteMessage(ChatMessage message) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Borrar mensaje'),
        content: const Text('Esta accion no se puede deshacer.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Borrar'),
          ),
        ],
      ),
    );

    if (confirm == true) {
      await _viewModel.deleteMessage(message);
    }
  }

  @override
  void dispose() {
    _viewModel.removeListener(_scrollWhenMessagesChange);
    _viewModel.dispose();
    _nameController.dispose();
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _viewModel,
      builder: (context, _) {
        final user = _viewModel.activeUser;
        return Scaffold(
          appBar: AppBar(
            title: Text(user == null ? 'Chat' : 'Chat - ${user.name}'),
            backgroundColor: Colors.white,
            surfaceTintColor: Colors.white,
          ),
          body: SafeArea(child: user == null ? _buildRegister() : _buildChat()),
        );
      },
    );
  }

  Widget _buildRegister() {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Entrar al chat',
                style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 18),
              TextField(
                controller: _nameController,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _viewModel.register(_nameController.text),
                decoration: const InputDecoration(
                  labelText: 'Nombre de usuario',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: _viewModel.connecting
                    ? null
                    : () => _viewModel.register(_nameController.text),
                child: Text(_viewModel.connecting ? 'Entrando...' : 'Entrar'),
              ),
              ErrorText(message: _viewModel.error),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildChat() {
    final user = _viewModel.activeUser!;

    return Column(
      children: [
        Expanded(
          child: ListView.builder(
            controller: _scrollController,
            padding: const EdgeInsets.all(14),
            itemCount: _viewModel.messages.length,
            itemBuilder: (context, index) {
              final message = _viewModel.messages[index];
              final isOwn = message.userId == user.id;
              return MessageBubble(
                message: message,
                isOwn: isOwn,
                mediaUrlBuilder: _viewModel.mediaUrl,
                onEdit: isOwn ? () => _editMessage(message) : null,
                onDelete: isOwn ? () => _deleteMessage(message) : null,
              );
            },
          ),
        ),
        ErrorText(message: _viewModel.error),
        Container(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
          color: Colors.white,
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _messageController,
                  minLines: 1,
                  maxLines: 4,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _sendMessage(),
                  decoration: const InputDecoration(
                    hintText: 'Escribe un mensaje',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                onPressed: _viewModel.sending ? null : _sendMessage,
                icon: const Icon(Icons.send),
                tooltip: 'Enviar',
              ),
            ],
          ),
        ),
      ],
    );
  }
}
